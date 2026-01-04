// settings.js

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

window.settingsModal = function() {
    return {
        isOpen: false,
        permission: 'default',
        isActive: false,
        statusMsg: '',

        init() {
            if ('Notification' in window) {
                this.permission = Notification.permission;
                this.isActive = (this.permission === 'granted');
                this.statusMsg = this.isActive ? 'Active' : 'Disabled';
            }
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
                this.permission = Notification.permission;
                this.isActive = (this.permission === 'granted');
            });
        },

        async toggleNotifications() {
            if (!('Notification' in window)) {
                alert("Not supported on this device.");
                return;
            }
            if (this.isActive) {
                alert("Already active! Disable in System Settings.");
                return;
            }
            try {
                this.statusMsg = "Requesting...";
                const result = await Notification.requestPermission();
                this.permission = result;
                this.isActive = (result === 'granted');
                if (result === 'granted') {
                    this.statusMsg = "Linking...";
                    await this.subscribeToPush();
                }
            } catch (error) {
                this.statusMsg = "Error";
            }
        },

        async subscribeToPush() {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(SUPABASE_CONFIG.VAPID_PUBLIC_KEY)
                });

                // Use the global client defined in app.js
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
                this.statusMsg = "Failed";
            }
        }
    }
}

// Ensure the body exists before injecting
document.addEventListener('DOMContentLoaded', () => {
    const settingsTemplate = `
    <div x-data="settingsModal()">
        <div x-show="isOpen" x-cloak x-transition.opacity class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div @click.outside="isOpen = false" class="bg-white w-full max-w-[340px] rounded-[32px] p-6 shadow-2xl relative">
                 <div class="flex items-center justify-between mb-6">
                     <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h2>
                     <button @click="isOpen = false" class="w-9 h-9 flex items-center justify-center bg-slate-100 rounded-full text-slate-500">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                 </div>
                 <div class="bg-slate-50 p-5 rounded-[24px] border border-slate-100">
                     <div class="flex items-center justify-between gap-4">
                         <div class="flex flex-col min-w-0">
                             <span class="font-bold text-slate-900 text-[15px]">Daily Briefing</span>
                             <span class="text-[11px] text-slate-400 font-medium">7:00 AM Summary</span>
                         </div>
                         <button @click="toggleNotifications()" class="relative w-[52px] h-[30px] rounded-full transition-colors" :class="isActive ? 'bg-black' : 'bg-slate-200'">
                             <div class="absolute top-[3px] left-[3px] bg-white w-6 h-6 rounded-full shadow-md transition-transform" :class="isActive ? 'translate-x-[22px]' : 'translate-x-0'"></div>
                         </button>
                     </div>
                 </div>
                 <div class="mt-4 text-center">
                     <span class="text-[10px] font-bold font-mono text-slate-300 uppercase" x-text="statusMsg"></span>
                 </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', settingsTemplate);
});