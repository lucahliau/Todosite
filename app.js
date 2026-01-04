// app.js

if (typeof SUPABASE_CONFIG !== 'undefined') {
    window.supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
}

window.todoApp = function() {
    return {
        todos: [],
        archivedTodos: [],
        newTodo: '',
        newDescription: '',
        newImportance: '2',
        newDeadline: '',
        searchQuery: '', // New Search State
        
        // App State
        isOnline: navigator.onLine,
        showFilters: false,
        showArchive: false, // New Archive Modal State
        activeTodo: null,
        inputFocused: false,
        darkMode: localStorage.getItem('theme') === 'dark',
        
        // Filter States
        filterStatus: 'all',
        sortBy: 'newest',
        filterDeadline: 'all',
        filterCategory: 'all',
        
        editingDesc: false,
        isSyncing: false,
        startY: 0,
        pullDistance: 0,
        iconStatus: 'Checking...',

        async init() {
            if (window.marked) marked.setOptions({ gfm: true, breaks: true });
            
            // Apply Dark Mode immediately
            if (this.darkMode) document.documentElement.classList.add('dark');
            
            // Listeners
            window.addEventListener('online', () => { this.isOnline = true; this.syncPending(); this.fetchTodos(); });
            window.addEventListener('offline', () => { this.isOnline = false; });
            
            // Settings Events
            window.addEventListener('toggle-dark-mode', () => this.toggleDarkMode());
            window.addEventListener('open-archive', () => { this.showArchive = true; this.fetchArchive(); });
            window.addEventListener('archive-completed', () => this.archiveCompletedTasks());
            window.addEventListener('archive-old', () => this.archiveOldTasks());

            const cached = localStorage.getItem('todo_cache');
            if (cached) {
                this.todos = JSON.parse(cached);
                this.updateBadgeCount();
            }
            this.fetchTodos();
            this.syncPending();
        },

        toggleDarkMode() {
            this.darkMode = !this.darkMode;
            localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
            if (this.darkMode) document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
        },

        updateBadgeCount() {
            if (!('setAppBadge' in navigator)) return;
            const count = this.todos.filter(t => 
                !t.is_completed && (t.deadline || parseInt(t.importance) === 3)
            ).length;
            if (count > 0) navigator.setAppBadge(count).catch(() => {});
            else navigator.clearAppBadge().catch(() => {});
        },

        // --- Fetching ---

        async fetchTodos() {
            if (!this.isOnline || !window.supabaseClient) return;
            // Filter out deleted tasks
            const { data, error } = await window.supabaseClient
                .from('todos')
                .select('*')
                .eq('is_deleted', false) 
                .order('created_at', { ascending: false });
                
            if (!error && data) {
                this.todos = data.map(t => this.sanitizeTodo(t));
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();
            }
        },

        async fetchArchive() {
            if (!this.isOnline || !window.supabaseClient) return;
            const { data, error } = await window.supabaseClient
                .from('todos')
                .select('*')
                .eq('is_deleted', true)
                .order('created_at', { ascending: false });
                
            if (!error && data) {
                this.archivedTodos = data.map(t => this.sanitizeTodo(t));
            }
        },

        // --- Actions ---

        async addTodo() {
            if (!this.newTodo.trim()) return;
            let taskText = this.capitalize(this.newTodo), category = null;
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
                is_deleted: false, // Default
                created_at: new Date().toISOString(), 
                subtasks: [] 
            };
            this.todos.unshift(newObj);
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.newTodo = ''; this.newDescription = ''; this.newDeadline = ''; this.inputFocused = false;
            this.updateBadgeCount();
            if (this.isOnline) this.syncPending();
        },

        async deleteTodo(id) { 
            // Soft Delete: Move to Archive
            if (confirm("Move this task to archive?")) { 
                // Remove from local active list
                this.todos = this.todos.filter(t => t.id !== id);
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();

                if (this.isOnline && !id.toString().startsWith('temp')) {
                    await window.supabaseClient.from('todos').update({ is_deleted: true }).eq('id', id);
                }
            } 
        },

        async restoreTodo(todo) {
            // Move from Archive back to Active
            this.archivedTodos = this.archivedTodos.filter(t => t.id !== todo.id);
            todo.is_deleted = false;
            this.todos.unshift(todo); // Add back to local list
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            
            if (this.isOnline) {
                await window.supabaseClient.from('todos').update({ is_deleted: false }).eq('id', todo.id);
            }
        },

        async permanentDelete(id) {
            if (confirm("Permanently delete this task? This cannot be undone.")) {
                this.archivedTodos = this.archivedTodos.filter(t => t.id !== id);
                if (this.isOnline) {
                    await window.supabaseClient.from('todos').delete().eq('id', id);
                }
            }
        },

        async archiveCompletedTasks() {
            if (!confirm("Move all completed tasks to archive?")) return;
            
            // 1. Identify tasks to archive
            const completed = this.todos.filter(t => t.is_completed);
            const completedIds = completed.map(t => t.id);

            // 2. Remove from local view
            this.todos = this.todos.filter(t => !t.is_completed);
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            
            // 3. Update DB
            if (this.isOnline && completedIds.length > 0) {
                await window.supabaseClient.from('todos').update({ is_deleted: true }).in('id', completedIds);
            }
            alert("Completed tasks archived.");
        },

        async archiveOldTasks() {
            if (!confirm("Archive tasks created more than 4 weeks ago?")) return;

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 28); // 4 weeks

            // 1. Identify tasks
            const oldTasks = this.todos.filter(t => new Date(t.created_at) < cutoff);
            const oldIds = oldTasks.map(t => t.id);

            if (oldIds.length === 0) { alert("No old tasks found."); return; }

            // 2. Remove local
            this.todos = this.todos.filter(t => !oldIds.includes(t.id));
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));

            // 3. Update DB
            if (this.isOnline) {
                await window.supabaseClient.from('todos').update({ is_deleted: true }).in('id', oldIds);
            }
            alert(`${oldIds.length} old tasks archived.`);
        },

        // --- Helpers ---

        sanitizeTodo(t) { 
            return { 
                ...t, 
                isPending: t.isPending || false, 
                description: t.description || '', 
                category: t.category || null,
                deadline: t.deadline || null, 
                is_deleted: t.is_deleted || false,
                subtasks: Array.isArray(t.subtasks) ? t.subtasks : [] 
            }; 
        },

        getDeadlineColor(dateStr, type) {
            if (!dateStr) return '';
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const deadline = new Date(dateStr);
            deadline.setHours(0, 0, 0, 0);
            const diffTime = deadline - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < 0) return type === 'text' ? 'text-rose-600' : 'bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400';
            if (diffDays <= 5) return type === 'text' ? 'text-orange-500' : 'bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400';
            return type === 'text' ? 'text-emerald-600' : 'bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400';
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

        // Sync Pending (Updated for is_deleted)
        async syncPending() {
            if (!this.isOnline || this.isSyncing || !window.supabaseClient) return;
            this.isSyncing = true;
            try {
                const pending = this.todos.filter(t => t.isPending);
                for (const task of pending) {
                    const { data, error } = await window.supabaseClient.from('todos').insert([{ 
                        task: this.capitalize(task.task), 
                        description: task.description || '', 
                        category: task.category || null,
                        importance: task.importance || 2, 
                        deadline: task.deadline || null, 
                        is_completed: task.is_completed || false, 
                        is_deleted: false,
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

        // Existing Update Functions...
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
            if (todo.category === '') todo.category = null;
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.updateBadgeCount();
            if (this.isOnline && !todo.isPending) { 
                await window.supabaseClient.from('todos').update({ 
                    task: todo.task, description: todo.description, category: todo.category, importance: todo.importance, deadline: todo.deadline
                }).eq('id', todo.id); 
            } 
        },

        // Touch Logic
        touchStart(e) { if (window.scrollY > 10) return; this.startY = e.touches ? e.touches[0].pageY : e.pageY; },
        touchMove(e) { if (window.scrollY > 10 || this.startY === 0) return; const y = e.touches ? e.touches[0].pageY : e.pageY; this.pullDistance = Math.max(0, y - this.startY); if (this.pullDistance > 20) e.preventDefault(); },
        async touchEnd() { if (this.pullDistance > 80) await this.fetchTodos(); this.startY = 0; this.pullDistance = 0; },

        // --- Getters & Sort Logic ---
        
        get activeTasks() { return this.applyFiltersAndSort(this.todos.filter(t => !t.is_completed)); },
        get completedTasks() { return this.applyFiltersAndSort(this.todos.filter(t => t.is_completed)); },

        // Filtered Archive List
        get filteredArchive() {
            let items = this.archivedTodos;
            if (this.searchQuery) {
                items = items.filter(t => t.task.toLowerCase().includes(this.searchQuery.toLowerCase()));
            }
            return items;
        },

        applyFiltersAndSort(items) {
            // 1. Search Filter (Real-time)
            if (this.searchQuery) {
                items = items.filter(t => t.task.toLowerCase().includes(this.searchQuery.toLowerCase()));
            }

            // 2. Filter by Deadline
            if (this.filterDeadline === 'scheduled') items = items.filter(t => t.deadline);
            else if (this.filterDeadline === 'anytime') items = items.filter(t => !t.deadline);

            // 3. Filter by Category
            if (this.filterCategory !== 'all') items = items.filter(t => t.category === this.filterCategory);

            // 4. Sort
            return items.sort((a, b) => { 
                if (this.sortBy === 'deadline') {
                    if (a.deadline && !b.deadline) return -1;
                    if (!a.deadline && b.deadline) return 1;
                    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                    return b.importance - a.importance;
                }
                if (this.sortBy === 'importance') {
                    if (b.importance !== a.importance) return b.importance - a.importance;
                    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                }
                return new Date(b.created_at) - new Date(a.created_at); 
            }); 
        },

        get uniqueCategories() { return [...new Set(this.todos.map(t => t.category).filter(c => c))].sort(); },
        applyCategory(cat) { this.newTodo = this.newTodo.replace(/#\w+/g, '').trim() + ' #' + cat; },
        
        getTagColor(category) {
            if (!category) return '';
            // Added dark mode color variants
            const colors = [
                'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', 
                'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400', 
                'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', 
                'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400', 
                'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            ];
            let hash = 0; for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
            return colors[Math.abs(hash) % colors.length];
        },
        openReadMode(todo) { this.activeTodo = todo; this.editingDesc = false; },
        closeReadMode() { this.activeTodo = null; }
    };
}