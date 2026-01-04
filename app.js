// app.js

if (typeof SUPABASE_CONFIG !== 'undefined') {
    window.supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
}

window.todoApp = function() {
    return {
        todos: [],
        newTodo: '',
        newDescription: '',
        newImportance: '2',
        newDeadline: '',
        isOnline: navigator.onLine,
        showFilters: false,
        activeTodo: null,
        inputFocused: false,
        
        // --- Updated Filter States ---
        filterStatus: 'all',      // 'all', 'active', 'completed'
        sortBy: 'newest',         // 'newest', 'importance', 'deadline'
        filterDeadline: 'all',    // 'all', 'scheduled', 'anytime'
        filterCategory: 'all',    // 'all', 'Work', etc.
        
        editingDesc: false,
        isSyncing: false,
        startY: 0,
        pullDistance: 0,
        iconStatus: 'Checking...',

        async init() {
            if (window.marked) marked.setOptions({ gfm: true, breaks: true });
            window.addEventListener('online', () => { this.isOnline = true; this.syncPending(); this.fetchTodos(); });
            window.addEventListener('offline', () => { this.isOnline = false; });
            const cached = localStorage.getItem('todo_cache');
            if (cached) {
                this.todos = JSON.parse(cached);
                this.updateBadgeCount();
            }
            this.fetchTodos();
            this.syncPending();
        },

        updateBadgeCount() {
            if (!('setAppBadge' in navigator)) return;
            const count = this.todos.filter(t => 
                !t.is_completed && (t.deadline || parseInt(t.importance) === 3)
            ).length;
            if (count > 0) {
                navigator.setAppBadge(count).catch(() => {});
            } else {
                navigator.clearAppBadge().catch(() => {});
            }
        },

        getDeadlineColor(dateStr, type) {
            if (!dateStr) return '';
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const deadline = new Date(dateStr);
            deadline.setHours(0, 0, 0, 0);
            const diffTime = deadline - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < 0) return type === 'text' ? 'text-rose-600' : 'bg-rose-50';
            if (diffDays <= 5) return type === 'text' ? 'text-orange-500' : 'bg-orange-50';
            return type === 'text' ? 'text-emerald-600' : 'bg-emerald-50';
        },

        formatDeadline(dateStr) {
            if (!dateStr) return '';
            const options = { month: 'short', day: 'numeric' };
            const deadline = new Date(dateStr);
            const today = new Date();
            if (deadline.toDateString() === today.toDateString()) return 'Today';
            return deadline.toLocaleDateString('en-US', options);
        },

        capitalize(str) {
            if (!str) return "";
            return str.charAt(0).toUpperCase() + str.slice(1);
        },

        touchStart(e) { if (window.scrollY > 10) return; this.startY = e.touches ? e.touches[0].pageY : e.pageY; },
        touchMove(e) { if (window.scrollY > 10 || this.startY === 0) return; const y = e.touches ? e.touches[0].pageY : e.pageY; this.pullDistance = Math.max(0, y - this.startY); if (this.pullDistance > 20) e.preventDefault(); },
        async touchEnd() { if (this.pullDistance > 80) await this.fetchTodos(); this.startY = 0; this.pullDistance = 0; },

        sanitizeTodo(t) { 
            return { ...t, isPending: t.isPending || false, description: t.description || '', deadline: t.deadline || null, subtasks: Array.isArray(t.subtasks) ? t.subtasks : [] }; 
        },

        async fetchTodos() {
            if (!this.isOnline || !window.supabaseClient) return;
            const { data, error } = await window.supabaseClient.from('todos').select('*').order('created_at', { ascending: false });
            if (!error && data) {
                this.todos = data.map(t => this.sanitizeTodo(t));
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();
            }
        },

        async syncPending() {
            if (!this.isOnline || this.isSyncing || !window.supabaseClient) return;
            this.isSyncing = true;
            try {
                const pending = this.todos.filter(t => t.isPending);
                for (const task of pending) {
                    const { data, error } = await window.supabaseClient.from('todos').insert([{ 
                        task: this.capitalize(task.task), 
                        description: task.description || '', 
                        category: task.category || 'General', 
                        importance: task.importance || 2, 
                        deadline: task.deadline || null, 
                        is_completed: task.is_completed || false, 
                        subtasks: task.subtasks || [] 
                    }]).select();
                    if (!error && data?.length > 0) {
                        const index = this.todos.findIndex(t => t.id === task.id);
                        if (index !== -1) { this.todos[index] = this.sanitizeTodo(data[0]); }
                    }
                }
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();
            } finally { 
                this.isSyncing = false; 
                if (this.todos.some(t => t.isPending)) this.syncPending(); 
            }
        },

        async addTodo() {
            if (!this.newTodo.trim()) return;
            let taskText = this.capitalize(this.newTodo), category = 'General';
            const hashMatch = taskText.match(/#(\w+)/);
            if (hashMatch) { category = hashMatch[1]; taskText = taskText.replace(hashMatch[0], '').trim(); }
            const newObj = { 
                id: 'temp-' + Date.now(), 
                task: taskText, 
                description: this.newDescription || '', 
                category: category, 
                importance: parseInt(this.newImportance), 
                deadline: this.newDeadline || null, 
                is_completed: false, 
                isPending: true, 
                created_at: new Date().toISOString(), 
                subtasks: [] 
            };
            this.todos.unshift(newObj);
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.newTodo = ''; this.newDescription = ''; this.newDeadline = ''; this.inputFocused = false;
            this.updateBadgeCount();
            if (this.isOnline) this.syncPending();
        },

        async toggleTodo(todo) { 
            todo.is_completed = !todo.is_completed; 
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.updateBadgeCount();
            if (this.isOnline && !todo.isPending) {
                await window.supabaseClient.from('todos').update({ is_completed: todo.is_completed }).eq('id', todo.id); 
            }
        },

        async updateMainTask(todo) { 
            todo.task = this.capitalize(todo.task);
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.updateBadgeCount();
            if (this.isOnline && !todo.isPending) { 
                await window.supabaseClient.from('todos').update({ 
                    task: todo.task, description: todo.description, category: todo.category, importance: todo.importance, deadline: todo.deadline
                }).eq('id', todo.id); 
            } 
        },

        async deleteTodo(id) { 
            if (confirm("Delete this task?")) { 
                this.todos = this.todos.filter(t => t.id !== id); 
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();
                if (this.isOnline && !id.toString().startsWith('temp')) {
                    await window.supabaseClient.from('todos').delete().eq('id', id); 
                }
            } 
        },

        // --- Updated Getters & Sort Logic ---
        
        get activeTasks() { 
            const items = this.todos.filter(t => !t.is_completed);
            return this.applyFiltersAndSort(items); 
        },
        
        get completedTasks() { 
            const items = this.todos.filter(t => t.is_completed);
            return this.applyFiltersAndSort(items); 
        },

        applyFiltersAndSort(items) {
            // 1. Filter by Deadline Presence
            if (this.filterDeadline === 'scheduled') {
                items = items.filter(t => t.deadline);
            } else if (this.filterDeadline === 'anytime') {
                items = items.filter(t => !t.deadline);
            }

            // 2. Filter by Category
            if (this.filterCategory !== 'all') {
                items = items.filter(t => t.category === this.filterCategory);
            }

            // 3. Sort
            return items.sort((a, b) => { 
                // Sort by Deadline (Urgent)
                if (this.sortBy === 'deadline') {
                    if (a.deadline && !b.deadline) return -1; // a comes first
                    if (!a.deadline && b.deadline) return 1;  // b comes first
                    if (a.deadline && b.deadline) {
                        return new Date(a.deadline) - new Date(b.deadline); // Earliest first
                    }
                    // Fallback to importance if no deadlines
                    return b.importance - a.importance;
                }
                
                // Sort by Priority
                if (this.sortBy === 'importance') {
                    if (b.importance !== a.importance) return b.importance - a.importance;
                    // Fallback to deadline if importance is same
                    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                }

                // Default: Newest Created
                return new Date(b.created_at) - new Date(a.created_at); 
            }); 
        },

        get uniqueCategories() { return [...new Set(this.todos.map(t => t.category).filter(c => c && c !== 'General'))].sort(); },
        applyCategory(cat) { this.newTodo = this.newTodo.replace(/#\w+/g, '').trim() + ' #' + cat; },
        
        getTagColor(category) {
            const colors = ['bg-blue-50 text-blue-600', 'bg-indigo-50 text-indigo-600', 'bg-emerald-50 text-emerald-600', 'bg-rose-50 text-rose-600', 'bg-amber-50 text-amber-600', 'bg-cyan-50 text-cyan-600', 'bg-pink-50 text-pink-600', 'bg-violet-50 text-violet-600', 'bg-lime-50 text-lime-600', 'bg-orange-50 text-orange-600', 'bg-teal-50 text-teal-600', 'bg-fuchsia-50 text-fuchsia-600', 'bg-sky-50 text-sky-600', 'bg-slate-100 text-slate-600', 'bg-purple-50 text-purple-600', 'bg-red-50 text-red-600', 'bg-green-50 text-green-600', 'bg-zinc-100 text-zinc-600', 'bg-neutral-100 text-neutral-600', 'bg-stone-100 text-stone-600'];
            let hash = 0; for (let i = 0; i < (category || '').length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
            return colors[Math.abs(hash) % colors.length];
        },
        openReadMode(todo) { this.activeTodo = todo; this.editingDesc = false; },
        closeReadMode() { this.activeTodo = null; }
    };
}