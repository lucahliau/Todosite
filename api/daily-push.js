import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export default async function handler(request, response) {
    // 1. Setup Supabase
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
    );

    // 2. Setup Web Push Security
    // You must set these in Vercel Environment Variables
    webpush.setVapidDetails(
        'mailto:your-email@example.com',
        process.env.VAPID_PUBLIC_KEY, // Note the prefix if using Next.js, otherwise just VAPID_PUBLIC_KEY
        process.env.VAPID_PRIVATE_KEY
    );

    try {
        // 3. Get all active tasks count
        // We only want to notify if there are actual tasks
        const { count, error: taskError } = await supabase
            .from('todos')
            .select('*', { count: 'exact', head: true })
            .eq('is_completed', false);

        if (taskError) throw taskError;

        // If no tasks, maybe send a "You're free!" message or nothing?
        const message = count > 0 
            ? `You have ${count} active tasks for today.` 
            : "No active tasks. Enjoy your day!";

        // 4. Get all subscribers
        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('subscription');

        if (subError) throw subError;

        console.log(`Found ${subscriptions.length} subscribers.`);

        // 5. Send Notification to each subscriber
        const notificationPayload = JSON.stringify({
            title: 'Daily Focus',
            body: message
        });

        const promises = subscriptions.map(sub => 
            webpush.sendNotification(sub.subscription, notificationPayload)
                .catch(err => {
                    // 410 Gone means the user blocked us or uninstalled the app
                    if (err.statusCode === 410) {
                        console.log('Subscription expired, deleting...');
                        // Optional: Delete from DB to clean up
                    } else {
                        console.error('Push error:', err);
                    }
                })
        );

        await Promise.all(promises);

        return response.status(200).json({ success: true, sent_to: subscriptions.length });

    } catch (err) {
        console.error("Server Error:", err);
        return response.status(500).json({ error: err.message });
    }
}