import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    // 1. Security & Method Check
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
        // "newer_than:7d" -> Limits to the last week
        // (appointment OR ...) -> Filters for keywords
        // Note: We removed "is:unread" so this includes read emails too.
        const keywords = ['appointment', 'reservation', 'meeting', 'interview', 'schedule', 'deadline', 'due', 'booking'];
        const query = `newer_than:7d (${keywords.join(' OR ')})`;

        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 15 // Limit to 15 to prevent timeouts/excessive token usage
        });

        const messages = listResponse.data.messages || [];

        if (messages.length === 0) {
            return res.status(200).json({ tasks: [], message: 'No matching emails found in the last week.' });
        }

        // 4. Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const newTasks = [];

        // 5. Process Emails
        for (const msg of messages) {
            // A. Fetch full email content
            const emailData = await gmail.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full'
            });

            const headers = emailData.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const snippet = emailData.data.snippet; // Short preview of the body

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

            try {
                const result = await model.generateContent(prompt);
                const response = result.response;
                // Clean any potential markdown code blocks from the string
                const text = response.text().replace(/```json|```/g, '').trim(); 
                
                if (text && text !== 'null') {
                    const taskData = JSON.parse(text);
                    // Double check we actually got a task object
                    if (taskData && taskData.task) {
                        newTasks.push({
                            ...taskData,
                            category: 'Email', 
                            emailId: msg.id 
                        });
                    }
                }
            } catch (aiError) {
                console.error(`AI Extraction Error (Msg ${msg.id}):`, aiError);
            }
        }

        return res.status(200).json({ tasks: newTasks });

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}