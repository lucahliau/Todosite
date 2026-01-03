// 1. The HTML Template (Centered Modal)
const settingsTemplate = `
<div x-data="settingsModal()" x-teleport="body">
    <div x-show="isOpen" 
         x-transition.opacity 
         class="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">

        <div x-show="isOpen" 
             @click.outside="isOpen = false"
             x-transition:enter="transition ease-out duration-200"
             x-transition:enter-start="opacity-0 scale-95"
             x-transition:enter-end="opacity-100 scale-100"
             x-transition:leave="transition ease-in duration-100"
             x-transition:leave-start="opacity-100 scale-100"
             x-transition:leave-end="opacity-0 scale-95"
             class="relative bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl overflow-hidden">

             <button @click="isOpen = false" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
             </button>

             <h2 class="text-xl font-extrabold text-slate-900 mb-6">Settings</h2>

             <div class="space-y-4">
                <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                        </div>
                        <div>
                            <h3 class="font-bold text-slate-900 text-sm">7:00 AM Briefing</h3>
                            <p class="text-[10px] text-slate-400">Daily task summary</p>
                        </div>
                    </div>
                    
                    <button @click="toggleNotifications()" 
                            class="relative w-12 h-7 rounded-full transition-colors duration-300"
                            :class="permission === 'granted' ? 'bg-green-500' : 'bg-slate-200'">
                        <div class="absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-300"
                             :class="permission === 'granted' ? 'translate-x-5' : 'translate-x-0'"></div>
                    </button>
                </div>

                <p class="text-[10px] text-center font-mono text-slate-400 uppercase tracking-widest pt-2" x-text="statusMsg"></p>
             </div>
        </div>
    </div>
</div>
`;

// 2. Inject HTML
document.body.insertAdjacentHTML('beforeend', settingsTemplate);

// 3. Logic
function settingsModal() {
    return {
        isOpen: false,
        permission: 'default',
        statusMsg: '',

        init() {
            // Default state is CLOSED
            this.isOpen = false;
            
            // Check current status
            if ('Notification' in window) {
                this.permission = Notification.permission;
                this.statusMsg = this.permission === 'granted' ? 'Notifications Active' : 'Tap toggle to enable';
            }

            // Listen for the trigger from index.html
            window.addEventListener('open-settings', () => {
                this.isOpen = true;
            });
        },

        async toggleNotifications() {
            if (!('Notification' in window)) {
                alert("This browser does not support notifications.");
                return;
            }

            if (this.permission === 'granted') {
                alert("You are already subscribed to daily updates.");
                return;
            }

            if (this.permission === 'denied') {
                alert("You have blocked notifications. Please go to iPhone Settings > Web Apps > To do > Notifications to enable them.");
                return;
            }

            try {
                this.statusMsg = "Requesting...";
                const result = await Notification.requestPermission();
                this.permission = result;
                
                if (result === 'granted') {
                    this.statusMsg = "✅ Subscribed!";
                    // Here we will eventually add the code to save the token to Supabase
                } else {
                    this.statusMsg = "❌ Permission Denied";
                }
            } catch (error) {
                console.error(error);
                this.statusMsg = "Error requesting permission";
            }
        }
    }
}