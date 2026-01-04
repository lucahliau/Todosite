// settings.js

/**
 * HELPER: Decodes VAPID key for Push Subscription
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * ALPINE COMPONENT: Settings Modal Logic
 */
window.settingsModal = function() {
    return {
        isOpen: false,
        isActive: false,
        statusMsg: 'Checking...',

        init() {
            // Check current notification status
            if ('Notification' in window) {
                this.isActive = (Notification.permission === 'granted');
                this.statusMsg = this.isActive ? 'Active' : 'Disabled';
            } else {
                this.statusMsg = 'Unsupported';
            }

            // Global listener to open the modal
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
                this.refreshState();
            });
        },

        refreshState() {
            if ('Notification' in window) {
                this.isActive = (Notification.permission === 'granted');
                this.statusMsg = this.isActive ? 'Active' : 'Disabled';
            }
        },

        async toggleNotifications() {
            if (!('Notification' in window)) {
                alert("Push notifications are not supported on this browser/device.");
                return;
            }

            // If already active, inform user they must disable via System Settings
            if (this.isActive) {
                alert("To disable notifications, please go to your Device Settings > Safari > Notifications.");
                return;
            }

            // Handle the 'Denied' state (System-level block)
            if (Notification.permission === 'denied') {
                alert("Notifications are blocked at the system level. Please enable them in your iPhone Settings.");
                return;
            }

            try {
                this.statusMsg = "Requesting...";
                const permission = await Notification.requestPermission();
                
                if (permission === 'granted') {
                    this.statusMsg = "Linking...";
                    await this.subscribeToPush();
                } else {
                    this.statusMsg = "Permission Denied";
                    this.isActive = false;
                }
            } catch (error) {
                console.error("Toggle error:", error);
                this.statusMsg = "System Error";
            }
        },

        async subscribeToPush() {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(SUPABASE_CONFIG.VAPID_PUBLIC_KEY)
                });

                const { error } = await window.supabaseClient
                    .from('push_subscriptions')
                    .insert([{ 
                        subscription: JSON.parse(JSON.stringify(sub)), 
                        user_agent: navigator.userAgent 
                    }]);

                if (error) throw error;
                
                this.statusMsg = "✅ Active";
                this.isActive = true;
            } catch (err) {
                console.error("Subscription failed:", err);
                this.statusMsg = "Sync Failed";
            }
        }
    }
}

/**
 * UI INJECTION: High-Z-Index Modal Template
 */
document.addEventListener('DOMContentLoaded', () => {
    const settingsTemplate = `
    <div x-data="settingsModal()" x-init="init()">
        <div x-show="isOpen" 
             x-cloak 
             x-transition.opacity 
             class="fixed inset-0 z-[10000] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-6">
            
            <div @click.outside="isOpen = false" 
                 x-show="isOpen"
                 x-transition:enter="transition ease-out duration-300"
                 x-transition:enter-start="opacity-0 translate-y-8"
                 x-transition:enter-end="opacity-100 translate-y-0"
                 class="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden p-8 relative">

                <div class="flex items-center justify-between mb-8">
                    <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h2>
                    <button @click="isOpen = false" class="p-2 bg-slate-100 rounded-full text-slate-400 active:scale-90 transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div class="bg-slate-50 p-6 rounded-[30px] border border-slate-100 flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 text-base">Push Notifications</span>
                        <span class="text-xs text-slate-400 font-medium tracking-tight" x-text="isActive ? 'Daily briefing enabled' : 'Currently disabled'"></span>
                    </div>

                    <button @click="toggleNotifications()" 
                            class="w-[56px] h-[32px] rounded-full p-1 transition-all duration-300 focus:outline-none flex items-center"
                            :class="isActive ? 'bg-black' : 'bg-slate-300'">
                        <div class="bg-white w-6 h-6 rounded-full shadow-sm transform transition-transform duration-300"
                             :class="isActive ? 'translate-x-6' : 'translate-x-0'"></div>
                    </button>
                </div>

                <div class="mt-6 flex justify-center">
                    <span class="text-[10px] font-black uppercase tracking-[0.15em] py-1.5 px-3 rounded-full bg-slate-100 text-slate-400" 
                          x-text="statusMsg"></span>
                </div>

                <button @click="isOpen = false" 
                        class="w-full mt-8 bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm active:scale-[0.98] transition-all">
                    Done
                </button>
            </div>
        </div>
    </div>`;
    
    document.body.insertAdjacentHTML('beforeend', settingsTemplate);
});