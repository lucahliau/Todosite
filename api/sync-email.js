import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    // 1. Model Selection: Using the "Pro" / Reasoning model for better date deduction
    const MODEL_NAME = "gemini-2.5-pro"; 
    console.log(`--- [DEBUG] Starting Email Sync (Model: ${MODEL_NAME}) ---`);

    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { provider_token } = req.body;
    if (!provider_token) {
        return res.status(401).json({ error: 'Missing Google Access Token' });
    }

    try {
        // 2. Setup Gmail Client
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: provider_token });
        const gmail = google.gmail({ version: 'v1', auth });

        // 3. Search Criteria
        // Broadened slightly to capture context, but still recent
        const keywords = ['appointment', 'reservation', 'meeting', 'interview', 'schedule', 'deadline', 'due', 'booking', 'flight', 'reminder'];
        const query = `newer_than:7d (${keywords.join(' OR ')})`;

        console.log(`--- [DEBUG] Gmail Query: ${query} ---`);

        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 15
        });

        const messages = listResponse.data.messages || [];
        console.log(`--- [DEBUG] Found ${messages.length} matching emails ---`);

        if (messages.length === 0) {
            return res.status(200).json({ tasks: [], message: 'No matching emails found.' });
        }

        // 4. Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const newTasks = [];

        // 5. Process Emails
        for (const msg of messages) {
            console.log(`\n[DEBUG] Processing Msg ID: ${msg.id}`);

            try {
                // A. Fetch full email content
                const emailData = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });

                const headers = emailData.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const dateHeader = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';
                const snippet = emailData.data.snippet || '';

                console.log(`   Subject: "${subject}"`);

                // B. Optimized Reasoning Prompt
                const prompt = `
                You are an expert executive assistant. Analyze this email to find a specific, actionable task or event.

                METADATA:
                - Email Subject: "${subject}"
                - Email Snippet: "${snippet}"
                - Email Sent Date: "${dateHeader}"

                INSTRUCTIONS:
                1. **Date Intelligence**:
                   - CRITICAL: Distinguish between the "Sent Date", "Forwarded Date", and the ACTUAL "Event Date".
                   - Example: If an email was forwarded on Jan 5th, but discusses an appointment on Jan 10th, the deadline is Jan 10th.
                   - If the email implies "tomorrow" or "next Friday", calculate the date relative to the "Email Sent Date".

                2. **Importance Scoring (1-3)**:
                   - 3 (High): Flights, Critical deadlines, Doctor appointments, Bills due now, Explicit "Urgent" requests.
                   - 2 (Medium): Work meetings, Dinner reservations, Calls, Standard tasks.
                   - 1 (Low): Casual reminders, "Check this out", General to-dos without hard consequences.

                3. **Description**:
                   - Extract a RICH description. Include the "Who" (people/companies), "Where" (locations/URLs), and "Why". 
                   - Do not just copy the subject.

                4. **Filtering**:
                   - If this is a newsletter, receipt (without action), spam, or purely informational, RETURN "null" (string).

                OUTPUT FORMAT (Strict JSON only, no markdown):
                {
                    "task": "Concise Title (Max 6 words)",
                    "description": "Detailed context including time, location, and key details.",
                    "importance": 1 | 2 | 3, 
                    "deadline": "YYYY-MM-DD" (or null if none)
                }
                `;

                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.text().replace(/```json|```/g, '').trim();
                
                if (text && text !== 'null') {
                    try {
                        const taskData = JSON.parse(text);
                        if (taskData && taskData.task) {
                            console.log(`   -> MATCH: [${taskData.deadline || 'No Date'}] ${taskData.task} (Imp: ${taskData.importance})`);
                            newTasks.push({
                                ...taskData,
                                category: 'Email', 
                                emailId: msg.id 
                            });
                        } else {
                            console.log(`   -> IGNORED: JSON valid but missing 'task'.`);
                        }
                    } catch (jsonErr) {
                         console.error(`   -> PARSE ERROR: ${text}`);
                    }
                } else {
                    console.log(`   -> IGNORED: AI returned null.`);
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