import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
    // 1. Setup Supabase (Using Service Key for Admin Access)
    // IMPORTANT: Ensure process.env.SUPABASE_KEY is your SERVICE ROLE KEY in Vercel
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
        // 3. Fetch all subscriptions with their User IDs
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('user_id, subscription');

        if (subError) throw subError;

        if (!subscriptions || subscriptions.length === 0) {
            return response.status(200).json({ message: "No subscribers found." });
        }

        // 4. Group subscriptions by User ID
        // Map: user_id -> [subscription_objects]
        const userSubs = {};
        subscriptions.forEach(sub => {
            if (sub.user_id) {
                if (!userSubs[sub.user_id]) userSubs[sub.user_id] = [];
                userSubs[sub.user_id].push(sub.subscription);
            }
        });

        const distinctUsers = Object.keys(userSubs);
        let sentCount = 0;

        // 5. Iterate over each user, fetch THEIR tasks, and send
        const sendPromises = distinctUsers.map(async (userId) => {
            
            // A. Fetch active tasks for this specific user
            const { data: tasks, error: taskError } = await supabase
                .from('todos')
                .select('task, deadline, importance')
                .eq('is_completed', false)
                .eq('user_id', userId); // Crucial: Filter by User

            if (taskError) {
                console.error(`Error fetching tasks for user ${userId}`, taskError);
                return; 
            }

            const count = tasks.length;
            if (count === 0) return; // Don't annoy users with 0 active tasks

            // B. Sort Logic (Same as App)
            const sortedTasks = tasks.sort((a, b) => {
                if (a.deadline && !b.deadline) return -1;
                if (!a.deadline && b.deadline) return 1;
                if (a.deadline && b.deadline) {
                    const dateA = new Date(a.deadline);
                    const dateB = new Date(b.deadline);
                    if (dateA !== dateB) return dateA - dateB;
                }
                return b.importance - a.importance;
            });

            // C. Build Message Body
            const topFive = sortedTasks.slice(0, 5);
            let messageBody = `Here are your most important tasks:\n`;
            
            topFive.forEach((t, index) => {
                let taskTitle = t.task.length > 30 ? t.task.substring(0, 30) + "..." : t.task;
                let dateLabel = "";
                if (t.deadline) {
                    const d = new Date(t.deadline);
                    const month = d.toLocaleString('en-US', { month: 'short' });
                    const day = d.getDate();
                    dateLabel = `${month} ${day}: `;
                }
                messageBody += `${index + 1}. ${dateLabel}${taskTitle}\n`;
            });

            const notificationPayload = JSON.stringify({
                title: `You have ${count} active tasks`,
                body: messageBody.trim(),
                badgeCount: count
            });

            // D. Send to all devices for this user
            const userDevicePromises = userSubs[userId].map(sub => 
                webpush.sendNotification(sub, notificationPayload)
                    .catch(err => {
                        if (err.statusCode === 410 || err.statusCode === 401) {
                            console.log('Subscription expired, cleaning up...');
                             // Optional cleanup: supabase.from('push_subscriptions').delete().match({ subscription: sub })
                        } else {
                            console.error('Push error:', err);
                        }
                    })
            );
            
            await Promise.all(userDevicePromises);
            sentCount += userDevicePromises.length;
        });

        await Promise.all(sendPromises);

        return response.status(200).json({ 
            success: true, 
            users_processed: distinctUsers.length,
            notifications_sent: sentCount
        });

    } catch (err) {
        console.error("Server Error:", err);
        return response.status(500).json({ error: err.message });
    }
}