import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    console.log("--- [DEBUG] Starting Email Sync ---");

    // 1. Security & Method Check
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { provider_token } = req.body;
    if (!provider_token) {
        console.error("--- [DEBUG] Error: Missing provider_token ---");
        return res.status(401).json({ error: 'Missing Google Access Token' });
    }

    try {
        // 2. Setup Gmail Client
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: provider_token });
        const gmail = google.gmail({ version: 'v1', auth });

        // 3. Search Criteria
        const keywords = ['appointment', 'reservation', 'meeting', 'interview', 'schedule', 'deadline', 'due', 'booking'];
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
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
                const snippet = emailData.data.snippet || '';

                console.log(`   Subject: "${subject}"`);
                console.log(`   Snippet: "${snippet.substring(0, 100)}..."`);

                // B. Ask AI to extract task
                const prompt = `
                Analyze this email to see if it contains a real, actionable task or appointment for me.
                
                Subject: "${subject}"
                Snippet: "${snippet}"

                Instructions:
                1. If this is a confirmation (e.g. flight, restaurant, doctor), a meeting request, or a specific task request, extract the details.
                2. If this is SPAM, a newsletter, a receipt without an action, or an advertisement, RETURN "null".
                3. Do not include markdown formatting in your response.

                If valid, return a JSON object with this format:
                {
                    "task": "Short title (max 6 words)",
                    "description": "Summary including specific time/location/links",
                    "importance": 2, 
                    "deadline": "YYYY-MM-DD" (or null if none)
                }
                `;

                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.text().replace(/```json|```/g, '').trim();
                
                console.log(`   AI Raw Output: ${text}`);

                if (text && text !== 'null') {
                    const taskData = JSON.parse(text);
                    if (taskData && taskData.task) {
                        console.log(`   -> MATCH: Created task "${taskData.task}"`);
                        newTasks.push({
                            ...taskData,
                            category: 'Email', 
                            emailId: msg.id 
                        });
                    } else {
                        console.log(`   -> IGNORED: JSON valid but missing 'task' field.`);
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