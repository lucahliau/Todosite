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
                 class="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] shadow-2xl flex flex-col transition-colors duration-300 overflow-hidden max-h-[85vh]">
                
                <div class="px-8 pt-8 pb-2 flex justify-between items-center shrink-0 mb-2">
                    <h2 class="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Settings</h2>
                    <button @click="isOpen = false" class="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 active:scale-90 transition-all -mr-2">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <div class="px-8 pb-16 overflow-y-auto no-scrollbar space-y-10">
                    
                    <div>
                        <h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest px-1">Appearance</h3>
                        <div class="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                            <button @click="setTheme('light')" 
                                    class="flex-1 py-2 rounded-lg text-xs font-bold transition-all" 
                                    :class="!darkMode ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-300'">
                                Light
                            </button>
                            <button @click="setTheme('dark')" 
                                    class="flex-1 py-2 rounded-lg text-xs font-bold transition-all" 
                                    :class="darkMode ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-500 hover:text-slate-300'">
                                Dark
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest px-1">Archive Tasks</h3>
                        <div class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                            
                            <button @click="openArchive()" class="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors group">
                                <div class="flex items-center space-x-4">
                                    <div class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                    </div>
                                    <div class="text-left">
                                        <span class="block text-sm font-bold text-slate-900 dark:text-white">Archive</span>
                                        <span class="block text-[10px] text-slate-400 font-medium">View deleted tasks</span>
                                    </div>
                                </div>
                                <svg class="w-5 h-5 text-slate-300 dark:text-slate-600 group-active:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                            </button>

                            <div class="h-px w-full bg-slate-200 dark:bg-slate-700 mx-4"></div>

                            <div class="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                                <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">Clear Completed Items</span>
                                <button @click="triggerArchiveCompleted()" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors active:scale-95">
                                    Clear
                                </button>
                            </div>

                            <div class="h-px w-full bg-slate-200 dark:bg-slate-700 mx-4"></div>

                            <div class="w-full flex items-center justify-between p-4 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                                <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">Clean Up Old Tasks (>30d)</span>
                                <button @click="triggerArchiveOld()" class="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-900 dark:text-white uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors active:scale-95">
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h3 class="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest px-1">Notifications</h3>
                        <div class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                </div>
                                <div>
                                    <h4 class="font-bold text-xs text-slate-900 dark:text-white">Daily Briefing</h4>
                                    <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">7:00 AM Summary</p>
                                </div>
                            </div>
                            <button @click="handleAction()" 
                                    :disabled="isActive"
                                    class="px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                                    :class="isActive ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'">
                                <span x-text="isActive ? 'Active' : 'Enable'"></span>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', template);
});