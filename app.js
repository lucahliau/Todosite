// app.js

// --- 1. Offline Support: Register the Service Worker ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: '/' })
            .then(reg => console.log('Service Worker Registered'))
            .catch(err => console.log('Service Worker Failed:', err));
    });
}

// --- 2. Initialize Supabase ---
if (typeof SUPABASE_CONFIG !== 'undefined') {
    window.supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
}

// --- 3. Main Application Logic ---
window.todoApp = function() {
    return {
        todos: [],
        archivedTodos: [],
        newTodo: '',
        newDescription: '',
        newImportance: '2',
        newDeadline: '',
        searchQuery: '', 
        
        // App State
        isOnline: navigator.onLine,
        showFilters: false,
        showArchive: false,
        activeTodo: null,
        inputFocused: false,
        
        // Context & Theme State
        // 'personal' = Light Mode, 'work' = Dark Mode
        context: localStorage.getItem('todo_context') || 'personal', 

        // Filter States
        filterStatus: 'all',
        sortBy: 'newest',
        filterDeadline: 'all',
        filterCategory: 'all',
        
        editingDesc: false,
        isSyncing: false,
        startY: 0,
        pullDistance: 0,
        realtimeChannel: null,

        async init() {
            if (window.marked) marked.setOptions({ gfm: true, breaks: true });
            
            // Apply Theme based on Context
            this.applyTheme();
            
            // Prevent duplicate listeners
            if (!window._hasInitListeners) {
                window.addEventListener('online', () => { 
                    this.isOnline = true; 
                    this.syncPending(); 
                    this.fetchTodos(); 
                });
                window.addEventListener('offline', () => { 
                    this.isOnline = false; 
                });
                
                // Settings Events
                window.addEventListener('open-archive', () => { this.showArchive = true; this.fetchArchive(); });
                window.addEventListener('archive-completed', () => this.archiveCompletedTasks());
                window.addEventListener('archive-old', () => this.archiveOldTasks());
                
                window._hasInitListeners = true;
            }

            // Load from Cache
            const cached = localStorage.getItem('todo_cache');
            if (cached) {
                this.todos = JSON.parse(cached);
                this.updateBadgeCount();
            }

            this.initRealtime();
            this.fetchTodos();
            this.syncPending();
        },

        // Switch between Personal (Light) and Work (Dark)
        setContext(mode) {
            this.context = mode;
            localStorage.setItem('todo_context', mode);
            this.applyTheme();
            this.showFilters = false; // Reset filters when switching views
        },

        applyTheme() {
            if (this.context === 'work') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        },

        updateBadgeCount() {
            if (!('setAppBadge' in navigator)) return;
            // Only count items in the current context
            const count = this.todos.filter(t => 
                !t.is_completed && 
                (t.context || 'personal') === this.context &&
                (t.deadline || parseInt(t.importance) === 3)
            ).length;

            if (count > 0) navigator.setAppBadge(count).catch(() => {});
            else navigator.clearAppBadge().catch(() => {});
        },

        // --- Fetching ---

        async fetchTodos() {
            if (!this.isOnline || !window.supabaseClient) return;
            
            // We fetch ALL tasks and filter client-side to ensure offline switching works
            const { data, error } = await window.supabaseClient
                .from('todos')
                .select('*')
                .eq('is_deleted', false) 
                .order('created_at', { ascending: false });
                
            if (!error && data) {
                const pendingTasks = this.todos.filter(t => t.isPending);
                const serverTasks = data.map(t => this.sanitizeTodo(t));
                this.todos = [...pendingTasks, ...serverTasks];
                
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

        // --- Realtime Sync ---

        initRealtime() {
            if (!window.supabaseClient) return;
            if (this.realtimeChannel) window.supabaseClient.removeChannel(this.realtimeChannel);

            this.realtimeChannel = window.supabaseClient
                .channel('public:todos')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
                    this.handleRealtimeEvent(payload);
                })
                .subscribe();
        },

        handleRealtimeEvent(payload) {
            const { eventType, new: newRec, old: oldRec } = payload;

            if (eventType === 'INSERT') {
                if (!this.todos.some(t => t.id === newRec.id)) {
                    this.todos.unshift(this.sanitizeTodo(newRec));
                }
            } 
            else if (eventType === 'UPDATE') {
                if (newRec.is_deleted) {
                    this.todos = this.todos.filter(t => t.id !== newRec.id);
                } else {
                    const index = this.todos.findIndex(t => t.id === newRec.id);
                    if (index !== -1) {
                        this.todos[index] = { ...this.todos[index], ...this.sanitizeTodo(newRec) };
                    } else {
                        this.todos.unshift(this.sanitizeTodo(newRec));
                    }
                }
            } 
            else if (eventType === 'DELETE') {
                this.todos = this.todos.filter(t => t.id !== oldRec.id);
            }

            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.updateBadgeCount();
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
                is_deleted: false,
                context: this.context, // Auto-assign current context
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
            if (confirm("Move this task to archive?")) { 
                this.todos = this.todos.filter(t => t.id !== id);
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();

                if (this.isOnline && !id.toString().startsWith('temp')) {
                    await window.supabaseClient.from('todos').update({ is_deleted: true }).eq('id', id);
                }
            } 
        },

        async restoreTodo(todo) {
            this.archivedTodos = this.archivedTodos.filter(t => t.id !== todo.id);
            todo.is_deleted = false;
            this.todos.unshift(todo);
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            
            if (this.isOnline) {
                await window.supabaseClient.from('todos').update({ is_deleted: false }).eq('id', todo.id);
            }
        },

        async permanentDelete(id) {
            if (confirm("Permanently delete this task?")) {
                this.archivedTodos = this.archivedTodos.filter(t => t.id !== id);
                if (this.isOnline) {
                    await window.supabaseClient.from('todos').delete().eq('id', id);
                }
            }
        },

        async archiveCompletedTasks() {
            // Only archive completed tasks in the CURRENT view
            if (!confirm(`Move completed ${this.context} tasks to archive?`)) return;
            
            const completed = this.todos.filter(t => t.is_completed && (t.context || 'personal') === this.context);
            const completedIds = completed.map(t => t.id);

            if (completedIds.length === 0) {
                alert("No completed tasks to archive.");
                return;
            }

            // Remove only the filtered ones from local state
            this.todos = this.todos.filter(t => !completedIds.includes(t.id));
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            
            if (this.isOnline) {
                await window.supabaseClient.from('todos').update({ is_deleted: true }).in('id', completedIds);
            }
        },

        async archiveOldTasks() {
            if (!confirm(`Archive ${this.context} tasks older than 4 weeks?`)) return;

            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 28);

            const oldTasks = this.todos.filter(t => 
                (t.context || 'personal') === this.context && 
                new Date(t.created_at) < cutoff
            );
            const oldIds = oldTasks.map(t => t.id);

            if (oldIds.length === 0) { 
                alert("No old tasks found."); 
                return; 
            }

            this.todos = this.todos.filter(t => !oldIds.includes(t.id));
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));

            if (this.isOnline) {
                await window.supabaseClient.from('todos').update({ is_deleted: true }).in('id', oldIds);
            }
        },

        sanitizeTodo(t) { 
            return { 
                ...t, 
                isPending: t.isPending || false, 
                description: t.description || '', 
                category: t.category || null,
                deadline: t.deadline || null, 
                is_deleted: t.is_deleted || false,
                context: t.context || 'personal', // Default to personal for legacy tasks
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
                        context: task.context || 'personal', // Sync context
                        subtasks: task.subtasks || [] 
                    }]).select();

                    if (!error && data?.length > 0) {
                        const realTask = data[0];
                        const tempId = task.id;
                        
                        const existingRealIndex = this.todos.findIndex(t => t.id === realTask.id);
                        const tempIndex = this.todos.findIndex(t => t.id === tempId);
                        
                        if (existingRealIndex !== -1) {
                            if (tempIndex !== -1) this.todos.splice(tempIndex, 1);
                        } else {
                            if (tempIndex !== -1) this.todos[tempIndex] = this.sanitizeTodo(realTask);
                        }
                    }
                }
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
                this.updateBadgeCount();
            } finally { 
                this.isSyncing = false; 
                if (this.todos.some(t => t.isPending)) this.syncPending(); 
            }
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
            if (todo.category === '') todo.category = null;
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.updateBadgeCount();
            if (this.isOnline && !todo.isPending) { 
                await window.supabaseClient.from('todos').update({ 
                    task: todo.task, 
                    description: todo.description, 
                    category: todo.category, 
                    importance: todo.importance, 
                    deadline: todo.deadline,
                    context: todo.context // Ensure context is preserved
                }).eq('id', todo.id); 
            } 
        },

        // Pull to Refresh Logic
        touchStart(e) { if (window.scrollY > 10) return; this.startY = e.touches ? e.touches[0].pageY : e.pageY; },
        touchMove(e) { if (window.scrollY > 10 || this.startY === 0) return; const y = e.touches ? e.touches[0].pageY : e.pageY; this.pullDistance = Math.max(0, y - this.startY); if (this.pullDistance > 20) e.preventDefault(); },
        async touchEnd() { if (this.pullDistance > 80) await this.fetchTodos(); this.startY = 0; this.pullDistance = 0; },

        // Getters - NOW FILTERED BY CONTEXT
        get activeTasks() { 
            return this.applyFiltersAndSort(
                this.todos.filter(t => !t.is_completed && (t.context || 'personal') === this.context)
            ); 
        },
        get completedTasks() { 
            return this.applyFiltersAndSort(
                this.todos.filter(t => t.is_completed && (t.context || 'personal') === this.context)
            ); 
        },

        get hasActiveFilters() {
            return this.filterStatus !== 'all' || 
                   this.sortBy !== 'newest' || 
                   this.filterDeadline !== 'all' || 
                   this.filterCategory !== 'all' ||
                   this.searchQuery.length > 0;
        },

        get filteredArchive() {
            // Archive also respects context
            let items = this.archivedTodos.filter(t => (t.context || 'personal') === this.context);
            if (this.searchQuery) {
                items = items.filter(t => t.task.toLowerCase().includes(this.searchQuery.toLowerCase()));
            }
            return items;
        },

        applyFiltersAndSort(items) {
            if (this.searchQuery) {
                items = items.filter(t => t.task.toLowerCase().includes(this.searchQuery.toLowerCase()));
            }
            if (this.filterDeadline === 'scheduled') items = items.filter(t => t.deadline);
            else if (this.filterDeadline === 'anytime') items = items.filter(t => !t.deadline);
            if (this.filterCategory !== 'all') items = items.filter(t => t.category === this.filterCategory);

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

        // Context-aware categories
        get uniqueCategories() { 
            const contextTodos = this.todos.filter(t => (t.context || 'personal') === this.context);
            return [...new Set(contextTodos.map(t => t.category).filter(c => c))].sort(); 
        },
        
        applyCategory(cat) { this.newTodo = this.newTodo.replace(/#\w+/g, '').trim() + ' #' + cat; },
        
        getTagColor(category) {
            if (!category) return '';
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