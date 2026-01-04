// --- HELPER: Decodes the VAPID key ---
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
        permission: 'default', // 'default', 'granted', 'denied'
        isActive: false,       // Local boolean to force the toggle UI to update
        statusMsg: '',

        init() {
            this.isOpen = false;
            
            // Check initial state
            if ('Notification' in window) {
                this.permission = Notification.permission;
                this.isActive = (this.permission === 'granted');
                this.statusMsg = this.isActive ? 'Active' : 'Disabled';
            }

            // Listen for open event
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
                // Re-check state every time we open just to be safe
                this.permission = Notification.permission;
                this.isActive = (this.permission === 'granted');
            });
        },

        async toggleNotifications() {
            // 1. Check Browser Support
            if (!('Notification' in window)) {
                alert("This device does not support web notifications.");
                return;
            }

            // 2. If already active, explain how to disable
            if (this.isActive) {
                alert("You are subscribed! To disable, remove the app from your home screen or turn off notifications in iOS Settings.");
                return;
            }

            // 3. If blocked by system
            if (this.permission === 'denied') {
                alert("⚠️ System Blocked: Please go to iOS Settings > Web Apps > To do > Notifications to enable them.");
                return;
            }

            // 4. Request Permission
            try {
                this.statusMsg = "Requesting...";
                const result = await Notification.requestPermission();
                
                // Update state immediately
                this.permission = result;
                this.isActive = (result === 'granted');
                
                if (result === 'granted') {
                    this.statusMsg = "Linking...";
                    await this.subscribeToPush();
                } else {
                    this.statusMsg = "Denied";
                    this.isActive = false; // Force toggle off
                }
            } catch (error) {
                console.error(error);
                this.statusMsg = "Error";
                this.isActive = false;
            }
        },

        async subscribeToPush() {
            try {
                if (!SUPABASE_CONFIG.VAPID_PUBLIC_KEY) {
                    throw new Error("Missing Public Key");
                }

                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(SUPABASE_CONFIG.VAPID_PUBLIC_KEY)
                });

                const { error } = await supabaseClient
                    .from('push_subscriptions')
                    .insert([{ 
                        subscription: JSON.parse(JSON.stringify(sub)), 
                        user_agent: navigator.userAgent 
                    }]);

                if (error) throw error;

                this.statusMsg = "✅ Active & Saved";
                this.isActive = true; // Ensure toggle stays green

            } catch (err) {
                console.error("Subscription failed:", err);
                this.statusMsg = "Save Failed";
                alert("Error: " + err.message);
            }
        }
    }
}

// --- HTML TEMPLATE (Fixed Layout & Width) ---
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
             class="bg-white w-full max-w-[340px] rounded-[32px] p-6 shadow-2xl overflow-hidden transform transition-all relative">

             <div class="flex items-center justify-between mb-6">
                 <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h2>
                 
                 <button @click="isOpen = false" class="w-9 h-9 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors active:scale-95">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
             </div>

             <div class="bg-slate-50 p-5 rounded-[24px] border border-slate-100">
                 <div class="flex items-center justify-between gap-4">
                     
                     <div class="flex items-center gap-3 overflow-hidden">
                         <div class="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center text-blue-600 shrink-0">
                             <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                         </div>
                         <div class="flex flex-col min-w-0">
                             <span class="font-bold text-slate-900 text-[15px] leading-tight truncate">Daily Briefing</span>
                             <span class="text-[11px] text-slate-400 font-medium leading-tight truncate">7:00 AM Summary</span>
                         </div>
                     </div>

                     <button @click="toggleNotifications()" 
                             type="button"
                             class="relative w-[52px] h-[30px] rounded-full transition-colors duration-300 shrink-0 focus:outline-none"
                             :class="isActive ? 'bg-black' : 'bg-slate-200'">
                         <div class="absolute top-[3px] left-[3px] bg-white w-6 h-6 rounded-full shadow-md transition-transform duration-300"
                              :class="isActive ? 'translate-x-[22px]' : 'translate-x-0'"></div>
                     </button>
                 </div>
             </div>

             <div class="mt-4 text-center">
                 <span class="text-[10px] font-bold font-mono text-slate-300 uppercase tracking-[0.2em]" x-text="statusMsg"></span>
             </div>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', settingsTemplate);