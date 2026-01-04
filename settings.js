// --- HELPER: Decodes the VAPID key for the browser ---
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

// --- LOGIC ---
window.settingsModal = function() {
    return {
        isOpen: false,
        permission: 'default',
        statusMsg: '',

        init() {
            this.isOpen = false;
            if ('Notification' in window) {
                this.permission = Notification.permission;
                this.statusMsg = this.permission === 'granted' ? 'Active' : 'Disabled';
            }
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
            });
        },

        async toggleNotifications() {
            // 1. Check Browser Support
            if (!('Notification' in window)) {
                alert("This device does not support web notifications.");
                return;
            }

            // 2. Check if already granted
            if (this.permission === 'granted') {
                alert("You are already subscribed! To reset, you must remove the app from your home screen.");
                return;
            }

            // 3. Check if blocked
            if (this.permission === 'denied') {
                alert("⚠️ Blocked: Please delete the app from your home screen and re-add it to reset permissions.");
                return;
            }

            // 4. Request Permission
            try {
                this.statusMsg = "Requesting...";
                const result = await Notification.requestPermission();
                this.permission = result;
                
                if (result === 'granted') {
                    this.statusMsg = "Linking...";
                    await this.subscribeToPush(); // <--- THIS IS THE MISSING PART
                } else {
                    this.statusMsg = "Denied";
                }
            } catch (error) {
                console.error(error);
                this.statusMsg = "Error: " + error.message;
            }
        },

        async subscribeToPush() {
            try {
                // Check if config exists
                if (!SUPABASE_CONFIG.VAPID_PUBLIC_KEY) {
                    throw new Error("Missing VAPID_PUBLIC_KEY in config.js");
                }

                // Get Service Worker
                const reg = await navigator.serviceWorker.ready;
                
                // Subscribe to Apple Push Server
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(SUPABASE_CONFIG.VAPID_PUBLIC_KEY)
                });

                // Save to Supabase
                const { error } = await supabaseClient
                    .from('push_subscriptions')
                    .insert([{ 
                        subscription: JSON.parse(JSON.stringify(sub)), 
                        user_agent: navigator.userAgent 
                    }]);

                if (error) throw error;

                this.statusMsg = "✅ Active & Saved";

            } catch (err) {
                console.error("Subscription failed:", err);
                this.statusMsg = "Save Failed";
                alert("Error: " + err.message);
            }
        }
    }
}

// --- HTML TEMPLATE (Correct Layout) ---
const settingsTemplate = `
<div x-data="settingsModal()">
    <div x-show="isOpen" 
         style="display: none;"
         x-transition.opacity 
         class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">

        <div x-show="isOpen" 
             style="display: none;"
             @click.outside="isOpen = false"
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0 scale-95"
             x-transition:enter-end="opacity-100 scale-100"
             class="bg-white w-full max-w-xs rounded-3xl shadow-2xl overflow-hidden transform transition-all">

             <div class="flex items-center justify-between px-6 pt-6 pb-2">
                 <h2 class="text-xl font-black text-slate-900 tracking-tight">Settings</h2>
                 <button @click="isOpen = false" class="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors active:scale-95">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
             </div>

             <div class="p-6 pt-2">
                 <div class="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                     <div class="flex items-center gap-3">
                         <div class="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-blue-600 shrink-0">
                             <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                         </div>
                         <div class="leading-tight">
                             <div class="font-bold text-slate-900 text-sm">Daily Briefing</div>
                             <div class="text-[10px] text-slate-400 font-medium">7:00 AM Summary</div>
                         </div>
                     </div>
                     <button @click="toggleNotifications()" 
                             class="relative w-12 h-7 rounded-full transition-colors duration-200 shrink-0 ml-2 focus:outline-none"
                             :class="permission === 'granted' ? 'bg-black' : 'bg-slate-200'">
                         <div class="absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-200"
                              :class="permission === 'granted' ? 'translate-x-5' : 'translate-x-0'"></div>
                     </button>
                 </div>
                 <div class="mt-4 text-center">
                     <span class="text-[10px] font-bold font-mono text-slate-300 uppercase tracking-widest" x-text="statusMsg"></span>
                 </div>
             </div>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', settingsTemplate);