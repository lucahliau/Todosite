import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    const MODEL_NAME = "gemini-2.5-pro"; 
    console.log(`--- [DEBUG] Starting Email Sync (Model: ${MODEL_NAME}) ---`);

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // 1. Get Token and Known IDs (Blocklist)
    const { provider_token, known_ids = [] } = req.body;
    
    if (!provider_token) {
        return res.status(401).json({ error: 'Missing Google Access Token' });
    }

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: provider_token });
        const gmail = google.gmail({ version: 'v1', auth });

        // 2. Search Criteria
        // We still search reasonably wide, but we filter strictly below
        const keywords = ['appointment', 'reservation', 'meeting', 'interview', 'schedule', 'deadline', 'due', 'booking', 'flight', 'reminder'];
        const query = `newer_than:7d (${keywords.join(' OR ')})`;

        console.log(`--- [DEBUG] Gmail Query: ${query} ---`);

        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 20 // Fetch a few more since we might filter some out
        });

        const allMessages = listResponse.data.messages || [];
        
        // 3. DEDUPLICATION: Filter out messages we already have
        const messages = allMessages.filter(msg => !known_ids.includes(msg.id));
        
        console.log(`--- [DEBUG] Found ${allMessages.length} emails. New: ${messages.length} (Filtered ${allMessages.length - messages.length} duplicates) ---`);

        if (messages.length === 0) {
            return res.status(200).json({ tasks: [], message: 'No new actionable emails found.' });
        }

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const newTasks = [];

        // 4. Process New Emails
        for (const msg of messages) {
            console.log(`\n[DEBUG] Processing Msg ID: ${msg.id}`);

            try {
                // A. Fetch full email content
                const emailData = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });

                const payload = emailData.data.payload;
                const headers = payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const dateHeader = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';
                const sender = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
                const snippet = emailData.data.snippet || '';

                // B. RECURSIVE ATTACHMENT FINDER
                let extraContext = "";
                
                // Helper to flatten the multipart structure
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
                
                // Find Calendar (.ics) or Text attachments
                const relevantAttachments = allParts.filter(p => 
                    (p.mimeType === 'text/calendar' || p.mimeType === 'application/ics' || p.filename?.endsWith('.ics')) ||
                    (p.mimeType === 'text/plain' && p.filename) // Text files, but not body text
                );

                if (relevantAttachments.length > 0) {
                    console.log(`   -> Found ${relevantAttachments.length} attachments. Parsing...`);
                    
                    for (const att of relevantAttachments) {
                        if (att.body && att.body.attachmentId) {
                            try {
                                const attachData = await gmail.users.messages.attachments.get({
                                    userId: 'me',
                                    messageId: msg.id,
                                    id: att.body.attachmentId
                                });
                                
                                if (attachData.data.data) {
                                    const decoded = Buffer.from(attachData.data.data, 'base64').toString('utf-8');
                                    extraContext += `\n\n--- ATTACHMENT (${att.filename || 'calendar.ics'}) ---\n${decoded.substring(0, 2000)}\n--- END ATTACHMENT ---\n`;
                                }
                            } catch (attErr) {
                                console.error("Failed to parse attachment", attErr);
                            }
                        }
                    }
                }

                // C. Optimized Prompt with Attachment Awareness
                const prompt = `
                You are an expert executive assistant. Analyze this email AND its attachments to find a specific, actionable task or event.

                METADATA:
                - Subject: "${subject}"
                - Sender: "${sender}"
                - Sent Date: "${dateHeader}"
                - Snippet: "${snippet}"

                ADDITIONAL CONTENT (Attachments/Calendar):
                ${extraContext}

                INSTRUCTIONS:
                1. **Priority**: TRUST THE ATTACHMENT (ICS/Calendar) over the email body for dates/times. 
                   - Look for 'DTSTART', 'DTEND', 'LOCATION' in the attachment text.
                   - If the email says "Forwarded: Meeting on Jan 10" but the ICS says "Jan 12", use Jan 12.

                2. **Description**: 
                   - Create a rich summary. 
                   - If it's a meeting, include the link/location. 
                   - If there is a person's name or company in the sender/subject, mention them.

                3. **Importance (1-3)**:
                   - 3 (High): Flights, Job Interviews, Doctor, Critical Deadlines, Bills.
                   - 2 (Medium): Work Meetings, Social Events, Reservations.
                   - 1 (Low): Reminders, FYIs.

                4. **Filtering**:
                   - Return "null" if it is spam, a newsletter, or has no clear action.

                OUTPUT JSON (No markdown):
                {
                    "task": "Concise Title",
                    "description": "Full details...",
                    "importance": 1-3, 
                    "deadline": "YYYY-MM-DD" (or null)
                }
                `;

                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.text().replace(/```json|```/g, '').trim();
                
                if (text && text !== 'null') {
                    try {
                        const taskData = JSON.parse(text);
                        if (taskData && taskData.task) {
                            console.log(`   -> MATCH: [${taskData.deadline}] ${taskData.task}`);
                            newTasks.push({
                                ...taskData,
                                category: 'Email', 
                                emailId: msg.id  // Important for deduplication next time
                            });
                        }
                    } catch (jsonErr) {
                         console.error(`   -> PARSE ERROR: ${text}`);
                    }
                }

            } catch (innerError) {
                console.error(`   [DEBUG] Error processing message ${msg.id}:`, innerError.message);
            }
        }

        console.log(`\n--- [DEBUG] Finished. Returning ${newTasks.length} tasks ---`);
        return res.status(200).json({ tasks: newTasks });

    } catch (error) {
        console.error("--- [DEBUG] Server Error ---", error);
        return res.status(500).json({ error: error.message });
    }
}