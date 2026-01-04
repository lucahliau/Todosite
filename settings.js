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
        darkMode: localStorage.getItem('theme') === 'dark',

        init() {
            this.refreshState();
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
                this.refreshState();
            });
        },

        toggleTheme() {
            this.darkMode = !this.darkMode;
            window.dispatchEvent(new CustomEvent('toggle-dark-mode'));
        },
        
        openArchive() {
            this.isOpen = false;
            setTimeout(() => window.dispatchEvent(new CustomEvent('open-archive')), 200);
        },

        triggerArchiveCompleted() {
            this.isOpen = false;
            setTimeout(() => window.dispatchEvent(new CustomEvent('archive-completed')), 200);
        },

        triggerArchiveOld() {
            this.isOpen = false;
            setTimeout(() => window.dispatchEvent(new CustomEvent('archive-old')), 200);
        },

        refreshState() {
            if ('Notification' in window) {
                this.permission = Notification.permission;
                this.isActive = (this.permission === 'granted');
                this.statusMsg = this.isActive ? 'Active' : (this.permission === 'denied' ? 'Blocked' : 'Disabled');
            }
        },

        async handleAction() {
            if (!('Notification' in window)) { alert("This device doesn't support notifications."); return; }
            if (this.permission === 'denied') { alert("Notifications are blocked."); return; }
            if (this.isActive) { alert("Notifications are already active."); return; }

            try {
                const result = await Notification.requestPermission();
                this.permission = result;
                if (result === 'granted') await this.subscribe();
                this.refreshState();
            } catch (err) { console.error(err); alert("Failed to request permission."); }
        },

        async subscribe() {
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(SUPABASE_CONFIG.VAPID_PUBLIC_KEY)
                });
                const { error } = await window.supabaseClient.from('push_subscriptions').insert([{ subscription: JSON.parse(JSON.stringify(sub)), user_agent: navigator.userAgent }]);
                if (error) throw error;
                this.isActive = true;
            } catch (err) { console.error(err); alert("Subscription failed: " + err.message); }
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
                 class="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl flex flex-col transition-colors duration-300">
                
                <div class="px-8 pt-8 pb-4 flex justify-between items-center">
                    <h2 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h2>
                    <button @click="isOpen = false" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 -mr-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div class="px-8 pb-8 space-y-8">
                    
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-lg text-slate-900 dark:text-slate-100">Dark Mode</span>
                        <button @click="toggleTheme()" 
                                class="w-14 h-8 rounded-full transition-colors relative focus:outline-none" 
                                :class="darkMode ? 'bg-slate-700' : 'bg-slate-200'">
                            <span class="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300"
                                  :class="darkMode ? 'translate-x-6' : 'translate-x-0'"></span>
                        </button>
                    </div>

                    <div class="h-px bg-slate-100 dark:bg-slate-800"></div>

                    <button @click="openArchive()" class="w-full flex items-center justify-between group py-2">
                        <div class="flex items-center space-x-4">
                            <div class="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </div>
                            <span class="font-bold text-lg text-slate-900 dark:text-slate-100">Trash & Archive</span>
                        </div>
                        <svg class="w-6 h-6 text-slate-300 group-active:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                    </button>

                    <div class="space-y-4">
                         <button @click="triggerArchiveCompleted()" class="w-full py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                            Archive All Completed
                        </button>
                        <button @click="triggerArchiveOld()" class="w-full py-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                            Archive Tasks > 4 Weeks
                        </button>
                    </div>

                    <div class="h-px bg-slate-100 dark:bg-slate-800"></div>

                    <div class="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-[24px] p-6 text-center">
                        <div class="w-10 h-10 bg-white dark:bg-slate-700 rounded-full shadow-sm flex items-center justify-center mx-auto mb-3 text-blue-600 dark:text-blue-400">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        </div>
                        <h3 class="font-bold text-slate-900 dark:text-white text-base mb-1">Daily Briefing</h3>
                        <p class="text-xs text-slate-400 mb-5">7:00 AM Notification</p>

                        <button @click="handleAction()" 
                                :disabled="isActive"
                                class="w-full py-3 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                                :class="isActive ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-black dark:bg-white text-white dark:text-black'">
                            <span x-text="isActive ? '✓ Active' : 'Enable'"></span>
                        </button>
                    </div>

                    <div class="text-center">
                        <p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Version 1.1.2</p>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', template);
});