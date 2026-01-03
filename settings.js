// 1. The HTML Template for the Settings Modal
const settingsTemplate = `
<div x-data="settingsHandler()" x-teleport="body">
    <div x-show="isOpen" 
         x-transition.opacity 
         @click="isOpen = false"
         class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"></div>

    <div x-show="isOpen" 
         x-transition:enter="transition ease-out duration-300 transform" 
         x-transition:enter-start="translate-y-full" 
         x-transition:enter-end="translate-y-0"
         x-transition:leave="transition ease-in duration-200 transform" 
         x-transition:leave-start="translate-y-0" 
         x-transition:leave-end="translate-y-full"
         class="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[30px] p-6 pb-12 shadow-2xl border-t border-slate-100 max-w-3xl mx-auto">
         
         <div class="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>

         <h2 class="text-2xl font-extrabold text-slate-900 mb-6">Settings</h2>

         <div class="space-y-6">
            <div class="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div class="flex items-center space-x-4">
                    <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    </div>
                    <div>
                        <h3 class="font-bold text-slate-900 text-sm">Daily Briefing</h3>
                        <p class="text-xs text-slate-400">Receive a summary at 7:00 AM</p>
                    </div>
                </div>
                
                <button @click="toggleNotifications()" 
                        class="relative w-12 h-7 rounded-full transition-colors duration-300"
                        :class="permission === 'granted' ? 'bg-green-500' : 'bg-slate-200'">
                    <div class="absolute top-1 left-1 bg-white w-5 h-5 rounded-full shadow-sm transition-transform duration-300"
                         :class="permission === 'granted' ? 'translate-x-5' : 'translate-x-0'"></div>
                </button>
            </div>
            
            <p class="text-[10px] text-center font-mono text-slate-400 uppercase tracking-widest" x-text="statusMsg"></p>
         </div>
    </div>
</div>
`;

// 2. Inject the HTML into the body immediately
document.body.insertAdjacentHTML('beforeend', settingsTemplate);

// 3. The Alpine Component Logic
function settingsHandler() {
    return {
        isOpen: false,
        permission: Notification.permission, // 'default', 'denied', or 'granted'
        statusMsg: 'Status: ' + Notification.permission,

        // We listen for a custom event 'open-settings' to show the menu
        init() {
            window.addEventListener('open-settings', () => { this.isOpen = true; });
        },

        async toggleNotifications() {
            if (this.permission === 'granted') {
                this.statusMsg = "You are already subscribed!";
                return;
            }

            if (this.permission === 'denied') {
                this.statusMsg = "⚠️ You blocked notifications. Please enable them in iPhone Settings.";
                alert("You have blocked notifications for this app. Please go to iPhone Settings > Web Apps to enable them.");
                return;
            }

            // Request Permission
            try {
                this.statusMsg = "Requesting permission...";
                const result = await Notification.requestPermission();
                this.permission = result;
                this.statusMsg = "Result: " + result;
                
                if (result === 'granted') {
                    // This is where we will trigger the subscription logic in Step 2
                    this.statusMsg = "✅ Success! Subscribing...";
                    console.log("Permission granted!");
                }
            } catch (err) {
                console.error("Notification Error:", err);
                this.statusMsg = "Error: " + err.message;
            }
        }
    }
}