import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
    // 1. Setup Supabase
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
    );

    // 2. Setup Web Push Security
    webpush.setVapidDetails(
        'mailto:your-email@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );

    try {
        // 3. Get Active Tasks
        // We fetch task, deadline, and importance to build the list
        const { data: tasks, error: taskError } = await supabase
            .from('todos')
            .select('task, deadline, importance')
            .eq('is_completed', false);

        if (taskError) throw taskError;

        const count = tasks.length;
        let messageBody = "";

        if (count === 0) {
            messageBody = "No active tasks. Enjoy your day!";
        } else {
            // 4. Sort Logic: 
            // - Tasks with deadlines come first
            // - Then by oldest deadline (date in past first)
            // - Then by importance (3 High, 2 Medium, 1 Low)
            const sortedTasks = tasks.sort((a, b) => {
                // Handle null deadlines (move to end)
                if (a.deadline && !b.deadline) return -1;
                if (!a.deadline && b.deadline) return 1;
                
                // Both have deadlines: sort by oldest date
                if (a.deadline && b.deadline) {
                    const dateA = new Date(a.deadline);
                    const dateB = new Date(b.deadline);
                    if (dateA !== dateB) return dateA - dateB;
                }

                // If deadlines are same or both null, sort by importance (High to Low)
                return b.importance - a.importance;
            });

            // 5. Format the Message
            const topFive = sortedTasks.slice(0, 5);
            messageBody = `You have ${count} tasks to complete. Here are your most important tasks:\n`;
            
            topFive.forEach((t, index) => {
                let taskTitle = t.task.length > 20 ? t.task.substring(0, 20) + "..." : t.task;
                let dateLabel = "";

                if (t.deadline) {
                    const d = new Date(t.deadline);
                    const month = d.toLocaleString('en-US', { month: 'short' });
                    const day = d.getDate();
                    dateLabel = `${month} ${day}: `;
                }

                messageBody += `${index + 1}. ${dateLabel}${taskTitle}\n`;
            });
        }

        // 6. Get all subscribers
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('subscription');

        if (subError) throw subError;

        // 7. Send Notification Payload
        const notificationPayload = JSON.stringify({
            title: 'To do', // Updated Title
            body: messageBody.trim()
        });

        const promises = subscriptions.map(sub => 
            webpush.sendNotification(sub.subscription, notificationPayload)
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 401) {
                        console.log('Subscription expired or invalid, cleaning up...');
                        // Optional: supabase.from('push_subscriptions').delete().eq(...)
                    } else {
                        console.error('Push error:', err);
                    }
                })
        );

        await Promise.all(promises);

        return response.status(200).json({ 
            success: true, 
            sent_to: subscriptions.length,
            preview_body: messageBody 
        });

    } catch (err) {
        console.error("Server Error:", err);
        return response.status(500).json({ error: err.message });
    }
}