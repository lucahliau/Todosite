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
        // Read directly from local storage for init state
        darkMode: localStorage.getItem('theme') === 'dark',

        init() {
            this.refreshState();
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
                // Re-check dark mode state when opening in case it changed elsewhere
                this.darkMode = document.documentElement.classList.contains('dark');
                this.refreshState();
            });
        },

        setTheme(mode) {
            if (mode === 'dark' && !this.darkMode) {
                this.darkMode = true;
                window.dispatchEvent(new CustomEvent('toggle-dark-mode'));
            } else if (mode === 'light' && this.darkMode) {
                this.darkMode = false;
                window.dispatchEvent(new CustomEvent('toggle-dark-mode'));
            }
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
                 class="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl flex flex-col transition-colors duration-300 max-h-[85vh] overflow-y-auto no-scrollbar">
                
                <div class="px-6 pt-6 pb-2 flex justify-between items-center shrink-0">
                    <h2 class="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h2>
                    <button @click="isOpen = false" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 active:scale-90 transition-all">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div class="p-6 space-y-8">
                    
                    <div>
                        <h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest px-1">Appearance</h3>
                        <div class="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                            <button @click="setTheme('light')" 
                                    class="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all" 
                                    :class="!darkMode ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'">
                                Light
                            </button>
                            <button @click="setTheme('dark')" 
                                    class="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all" 
                                    :class="darkMode ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-400 hover:text-slate-600'">
                                Dark
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest px-1">Data</h3>
                        <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden">
                            
                            <button @click="openArchive()" class="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                                <div class="flex items-center space-x-3">
                                    <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </div>
                                    <span class="text-sm font-bold text-slate-700 dark:text-slate-200">Trash & Archive</span>
                                </div>
                                <svg class="w-4 h-4 text-slate-300 group-active:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                            </button>

                            <div class="h-px bg-slate-100 dark:bg-slate-800 mx-4"></div>

                            <button @click="triggerArchiveCompleted()" class="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Archive Completed</span>
                                <span class="text-[10px] font-bold text-blue-500 uppercase">Run</span>
                            </button>

                            <div class="h-px bg-slate-100 dark:bg-slate-800 mx-4"></div>

                            <button @click="triggerArchiveOld()" class="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Archive Old (>4w)</span>
                                <span class="text-[10px] font-bold text-blue-500 uppercase">Run</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest px-1">Notifications</h3>
                        <div class="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 flex items-center justify-between">
                            <div>
                                <h4 class="font-bold text-sm text-slate-900 dark:text-white">Daily Briefing</h4>
                                <p class="text-xs text-slate-400 mt-0.5">7:00 AM Summary</p>
                            </div>
                            <button @click="handleAction()" 
                                    :disabled="isActive"
                                    class="px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95"
                                    :class="isActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-black dark:bg-white text-white dark:text-black'">
                                <span x-text="isActive ? 'Active' : 'Enable'"></span>
                            </button>
                        </div>
                    </div>

                    <div class="text-center pb-2">
                        <p class="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Version 1.2.0</p>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', template);
});