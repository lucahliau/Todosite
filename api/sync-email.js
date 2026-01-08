import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    // Using 1.5 Pro for better reasoning on dates and complex emails
    const MODEL_NAME = "gemini-1.5-pro"; 
    
    console.log(`--- [DEBUG] Starting Email Sync (Model: ${MODEL_NAME}) ---`);

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // 1. Get Inputs
    // We default to 'America/New_York' since we know you are in NYC, 
    // but the frontend can pass a specific zone if needed.
    const { provider_token, known_ids = [], timeZone = 'America/New_York' } = req.body;
    
    if (!provider_token) {
        return res.status(401).json({ error: 'Missing Google Access Token. Please sign out and sign in again.' });
    }

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: provider_token });
        const gmail = google.gmail({ version: 'v1', auth });

        // 2. Search Criteria
        const keywords = ['appointment', 'reservation', 'meeting', 'interview', 'schedule', 'deadline', 'due', 'booking', 'flight', 'reminder'];
        // We fetch a few more messages to account for the stricter filtering we are about to do
        const query = `newer_than:7d (${keywords.join(' OR ')})`;

        // --- AUTH CHECK ---
        // We wrap this first call to catch specific "Insufficient Permission" errors.
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 20 
        }).catch(err => {
            if (err.code === 403) {
                console.error("--- [DEBUG] 403 Forbidden: Missing Scopes ---");
                throw new Error("Your session is missing the required Gmail permissions. Please sign out and sign back in to refresh your token.");
            }
            throw err;
        });

        const allMessages = listResponse.data.messages || [];
        const messages = allMessages.filter(msg => !known_ids.includes(msg.id));
        
        if (messages.length === 0) {
            return res.status(200).json({ tasks: [], message: 'No new actionable emails found.' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            generationConfig: { responseMimeType: "application/json" }
        });

        const newTasks = [];
        
        // Helper: Get formatted current time in the user's specific timezone
        // This anchors "today" so the LLM knows what "Next Tuesday" means.
        const getCurrentUserDate = () => {
            return new Date().toLocaleString('en-US', { 
                timeZone: timeZone,
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        };

        // Helper: Redact sensitive data before sending to LLM
        const redactPII = (text) => {
            if (!text) return "";
            // Redact Credit Card-like sequences (13-19 digits, dashes/spaces)
            let safe = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]');
            // Redact SSN-like sequences
            safe = safe.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
            return safe;
        };

        // 3. Process Emails
        for (const msg of messages) {
            try {
                const emailData = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
                const payload = emailData.data.payload;
                const headers = payload.headers;
                
                // --- A. SPAM & NOISE FILTERING ---
                const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
                
                const precedence = getHeader('Precedence').toLowerCase();
                const autoResponse = getHeader('X-Auto-Response-Suppress');
                const unsubscribe = getHeader('List-Unsubscribe');
                
                // Skip explicit bulk/auto-generated emails immediately
                if (precedence === 'bulk' || precedence === 'junk' || autoResponse) {
                    console.log(`   -> Skipping Bulk/Auto: ${msg.id}`);
                    continue;
                }

                const subject = redactPII(getHeader('Subject') || 'No Subject');
                const dateHeader = getHeader('Date'); // This is the email's "sent" time
                const sender = redactPII(getHeader('From') || 'Unknown');
                const snippet = redactPII(emailData.data.snippet || '');

                // --- B. ATTACHMENT PARSING (ICS/Text) ---
                let extraContext = "";
                const getAllParts = (parts) => {
                    let flat = [];
                    if (!parts) return flat;
                    for (const p of parts) {
                        flat.push(p);
                        if (p.parts) flat = flat.concat(getAllParts(p.parts));
                    }
                    return flat;
                };

                const allParts = getAllParts(payload.parts);
                const relevantAttachments = allParts.filter(p => 
                    p.mimeType?.includes('calendar') || 
                    p.mimeType?.includes('ics') || 
                    p.filename?.endsWith('.ics')
                );

                for (const att of relevantAttachments) {
                    if (att.body?.attachmentId) {
                        const attachData = await gmail.users.messages.attachments.get({
                            userId: 'me', messageId: msg.id, id: att.body.attachmentId
                        });
                        if (attachData.data.data) {
                            const decoded = Buffer.from(attachData.data.data, 'base64').toString('utf-8');
                            // Redact PII in attachments too
                            extraContext += `\n[ATTACHMENT: ${att.filename}]\n${redactPII(decoded.substring(0, 4000))}\n[END ATTACHMENT]\n`;
                        }
                    }
                }

                // --- C. PROMPT ENGINEERING ---
                const prompt = `
                You are an expert executive assistant. Analyze this email to identify **one** concrete, actionable task or event.

                ### CONTEXT
                - **User's Current Time:** ${getCurrentUserDate()} (${timeZone})
                - **Email Sent:** ${dateHeader}
                - **Subject:** "${subject}"
                - **Sender:** "${sender}"
                - **Snippet:** "${snippet}"
                - **Is Mailing List:** ${unsubscribe ? 'Yes (Be skeptical of marketing)' : 'No'}

                ### ATTACHMENTS (Highest Priority for Dates)
                ${extraContext}

                ### INSTRUCTIONS
                1. **Filter Noise**: 
                   - IGNORE deadlines related to: Sales ("50% off ends Friday"), Promotions, Webinars, Newsletters, or generic "updates".
                   - ONLY extract: Personal meetings, Flights, Bills due, Project deadlines, Reservations.
                   - If the email is spam or marketing, return null.

                2. **Date Extraction (CRITICAL)**: 
                   - **Source of Truth:** Use 'DTSTART'/'DTEND' in attachments if available.
                   - **Relative Dates:** If email says "tomorrow", calculate it relative to **Email Sent Date** (not User's Current Time).
                   - **Format:** Output "YYYY-MM-DD".
                   - **Timezone:** Keep the "local" date of the event. Do NOT shift 7 PM Friday to Saturday UTC.

                3. **Description**:
                   - Write a rich summary.
                   - **LINK EXTRACTION:** If there is a Zoom/Teams/Meet link or a "View Booking" URL, extract it and append to the description: " | Link: [URL]"

                ### OUTPUT JSON (Return null if no task)
                {
                    "task": "Concise Title",
                    "description": "Details including time (e.g. 'at 2pm') and links.",
                    "importance": 1-3, 
                    "deadline": "YYYY-MM-DD" or null
                }
                `;

                const result = await model.generateContent(prompt);
                const responseText = result.response.text();
                const cleanJson = responseText.replace(/```json|```/g, '').trim();
                
                if (cleanJson && cleanJson !== 'null') {
                    const taskData = JSON.parse(cleanJson);
                    
                    if (taskData && taskData.task) {
                        if (taskData.deadline === 'null') taskData.deadline = null;

                        console.log(`   -> MATCH: [${taskData.deadline || 'No Date'}] ${taskData.task}`);
                        newTasks.push({
                            ...taskData,
                            category: 'Email', 
                            emailId: msg.id
                        });
                    }
                }

            } catch (err) {
                console.error(`   [DEBUG] Error on email ${msg.id}:`, err.message);
                continue;
            }
        }

        return res.status(200).json({ tasks: newTasks });

    } catch (error) {
        console.error("--- [DEBUG] Server Error ---", error);
        return res.status(500).json({ error: error.message });
    }
}