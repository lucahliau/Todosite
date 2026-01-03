// 1. Logic Function
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
            // Check for browser support
            if (!('Notification' in window)) {
                alert("This device does not support web notifications.");
                return;
            }

            // If already granted, just info
            if (this.permission === 'granted') {
                alert("You are already subscribed! You will receive updates at 7:00 AM.");
                return;
            }

            // If denied, guide user to system settings
            if (this.permission === 'denied') {
                alert("⚠️ System Blocked: You previously denied permission. Please delete this app icon and re-add it to your home screen to reset the prompt.");
                return;
            }

            // Request Permission
            try {
                this.statusMsg = "Requesting...";
                const result = await Notification.requestPermission();
                this.permission = result;
                
                if (result === 'granted') {
                    this.statusMsg = "Active";
                    // In the next step, we will add the Supabase token save here
                } else {
                    this.statusMsg = "Denied";
                }
            } catch (error) {
                console.error(error);
                this.statusMsg = "Error";
            }
        }
    }
}

// 2. HTML Template (Fixed Alignment)
const settingsTemplate = `
<div x-data="settingsModal()">
    <div x-show="isOpen" 
         style="display: none;"
         x-transition.opacity 
         class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">

        <div x-show="isOpen" 
             style="display: none;"
             @click.outside="isOpen = false"
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0 scale-95"
             x-transition:enter-end="opacity-100 scale-100"
             class="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl">

             <div class="flex items-center justify-between mb-8">
                 <h2 class="text-2xl font-extrabold text-slate-900 tracking-tight">Settings</h2>
                 
                 <button @click="isOpen = false" class="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 active:scale-90 transition-all">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
             </div>

             <div class="space-y-3">
                <div class="flex items-center justify-between p-5 bg-slate-50 rounded-3xl border border-slate-100">
                    <div class="flex items-center space-x-4">
                        <div class="w-12 h-12 rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-blue-600">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-900 text-base">Daily Briefing</h3>
                            <p class="text-xs text-slate-400 font-medium">7:00 AM Summary</p>
                        </div>
                    </div>
                    
                    <button @click="toggleNotifications()" 
                            class="relative w-14 h-8 rounded-full transition-colors duration-300 focus:outline-none"
                            :class="permission === 'granted' ? 'bg-black' : 'bg-slate-200'">
                        <div class="absolute top-1 left-1 bg-white w-6 h-6 rounded-full shadow-md transition-transform duration-300"
                             :class="permission === 'granted' ? 'translate-x-6' : 'translate-x-0'"></div>
                    </button>
                </div>

                <p class="text-[10px] text-center font-bold font-mono text-slate-300 uppercase tracking-widest" x-text="statusMsg"></p>
             </div>
        </div>
    </div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', settingsTemplate);