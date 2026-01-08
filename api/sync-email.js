import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    // Upgraded to Gemini 3 Pro - current flagship for complex reasoning
    const MODEL_NAME = "gemini-3-pro"; 
    
    console.log(`--- [DEBUG] Starting Email Sync (Model: ${MODEL_NAME}) ---`);

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // 1. Get Inputs
    // Defaulting to NYC timezone for accurate date extraction
    const { provider_token, known_ids = [], timeZone = 'America/New_York' } = req.body;
    
    if (!provider_token) {
        return res.status(401).json({ error: 'Missing Google Access Token. Please sign in again.' });
    }

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: provider_token });
        const gmail = google.gmail({ version: 'v1', auth });

        // 2. Search Criteria
        const keywords = ['appointment', 'reservation', 'meeting', 'interview', 'schedule', 'deadline', 'due', 'booking', 'flight', 'reminder'];
        const query = `newer_than:7d (${keywords.join(' OR ')})`;

        // --- AUTH & PERMISSION CHECK ---
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 20 
        }).catch(err => {
            if (err.code === 403) {
                console.error("--- [DEBUG] 403 Forbidden: Missing gmail.readonly scope ---");
                throw new Error("Insufficient Permissions: Please Sign Out and Sign In again to refresh permissions.");
            }
            throw err;
        });

        const allMessages = listResponse.data.messages || [];
        const messages = allMessages.filter(msg => !known_ids.includes(msg.id));
        
        if (messages.length === 0) {
            return res.status(200).json({ tasks: [], message: 'No new actionable emails found.' });
        }

        // 3. Initialize Gemini 3 Pro
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
            model: MODEL_NAME,
            generationConfig: { 
                responseMimeType: "application/json" 
            }
        });

        const newTasks = [];
        
        // Helper: Get current time for LLM "today" context
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

        // Helper: Redact sensitive data
        const redactPII = (text) => {
            if (!text) return "";
            let safe = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_CARD]');
            safe = safe.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
            return safe;
        };

        // 4. Process Emails
        for (const msg of messages) {
            try {
                const emailData = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
                const payload = emailData.data.payload;
                const headers = payload.headers;
                
                const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
                
                const precedence = getHeader('Precedence').toLowerCase();
                const autoResponse = getHeader('X-Auto-Response-Suppress');
                const unsubscribe = getHeader('List-Unsubscribe');
                
                // Noise Filtering
                if (precedence === 'bulk' || precedence === 'junk' || autoResponse) {
                    console.log(`   -> Skipping Bulk/Auto: ${msg.id}`);
                    continue;
                }

                const subject = redactPII(getHeader('Subject') || 'No Subject');
                const dateHeader = getHeader('Date'); 
                const sender = redactPII(getHeader('From') || 'Unknown');
                const snippet = redactPII(emailData.data.snippet || '');

                // Attachment Extraction (ICS/Calendar)
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
                            extraContext += `\n[ATTACHMENT: ${att.filename}]\n${redactPII(decoded.substring(0, 4000))}\n[END ATTACHMENT]\n`;
                        }
                    }
                }

                // AI Prompt
                const prompt = `
                Expert Executive Assistant Analysis. Identify ONE concrete, actionable task or event.

                ### CONTEXT
                - **User's Current Time:** ${getCurrentUserDate()} (${timeZone})
                - **Email Sent:** ${dateHeader}
                - **Subject:** "${subject}"
                - **Sender:** "${sender}"
                - **Snippet:** "${snippet}"
                - **Is Mailing List:** ${unsubscribe ? 'Yes' : 'No'}

                ### ATTACHMENTS
                ${extraContext}

                ### INSTRUCTIONS
                1. Filter marketing noise. Extract ONLY: Personal meetings, Flights, Bills, Project deadlines, Reservations.
                2. Use 'DTSTART' from attachments for highest date accuracy.
                3. Calculate relative dates ("tomorrow") based on Email Sent Date.
                4. Extract meeting links (Zoom/Meet/Teams) and append to description.

                ### OUTPUT JSON
                {
                    "task": "Title",
                    "description": "Details including time and links.",
                    "importance": 1-3, 
                    "deadline": "YYYY-MM-DD" or null
                }`;

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