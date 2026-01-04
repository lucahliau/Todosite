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
        isActive: false,
        statusMsg: '',
        permission: 'default',

        init() {
            this.refreshState();
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
                this.refreshState();
            });
        },

        refreshState() {
            if ('Notification' in window) {
                this.permission = Notification.permission;
                this.isActive = (this.permission === 'granted');
                this.statusMsg = this.isActive ? 'Active' : (this.permission === 'denied' ? 'Blocked' : 'Disabled');
            }
        },

        async handleAction() {
            if (!('Notification' in window)) {
                alert("This device doesn't support notifications.");
                return;
            }

            if (this.permission === 'denied') {
                alert("Notifications are blocked. Please reset permissions in your browser or iOS Settings.");
                return;
            }

            if (this.isActive) {
                alert("Notifications are already active. To stop receiving them, you must revoke permission in your device settings.");
                return;
            }

            try {
                const result = await Notification.requestPermission();
                this.permission = result;
                if (result === 'granted') {
                    await this.subscribe();
                }
                this.refreshState();
            } catch (err) {
                console.error(err);
                alert("Failed to request permission.");
            }
        },

        async subscribe() {
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
                this.isActive = true;
            } catch (err) {
                console.error("Subscription failed", err);
                alert("Subscription failed: " + err.message);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const template = `
    <div x-data="settingsModal()" x-init="init()">
        <div x-show="isOpen" 
             x-cloak 
             x-transition.opacity 
             class="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            
            <div @click.outside="isOpen = false" 
                 class="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl flex flex-col">
                
                <div class="px-8 pt-8 pb-4 flex justify-between items-center">
                    <h2 class="text-2xl font-black text-slate-900 tracking-tight">Settings</h2>
                    <button @click="isOpen = false" class="text-slate-400 hover:text-slate-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div class="px-8 pb-8 space-y-6">
                    <div class="bg-slate-50 border border-slate-100 rounded-[24px] p-6 text-center">
                        <div class="w-12 h-12 bg-white rounded-full shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4 text-blue-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        </div>
                        
                        <h3 class="font-bold text-slate-900 mb-1">Push Notifications</h3>
                        <p class="text-xs text-slate-400 font-medium mb-6">Receive your daily briefing at 7:00 AM</p>

                        <button @click="handleAction()" 
                                :disabled="isActive"
                                class="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
                                :class="isActive ? 'bg-emerald-50 text-emerald-600' : 'bg-black text-white'">
                            <span x-text="isActive ? '✓ Notifications Active' : 'Enable Notifications'"></span>
                        </button>
                        
                        <div class="mt-4">
                            <span class="text-[9px] font-black uppercase tracking-widest text-slate-300" x-text="'Status: ' + statusMsg"></span>
                        </div>
                    </div>

                    <div class="text-center space-y-1">
                        <p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Version 1.0.4</p>
                        <button @click="isOpen = false" class="text-sm font-bold text-slate-900 pt-4">Dismiss</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', template);
});