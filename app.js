// app.js
if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }

// Ensure config.js is loaded before this file in your HTML
const supabaseClient = supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);

function todoApp() {
    return {
        todos: [], 
        newTodo: '', 
        newDescription: '', 
        newImportance: '2', 
        isOnline: navigator.onLine, 
        showFilters: false, 
        activeTodo: null, 
        inputFocused: false, 
        filterStatus: 'all', 
        sortBy: 'newest', 
        editingDesc: false, 
        tempSubTitle: '', 
        tempSubDesc: '', 
        isSyncing: false, 
        startY: 0, 
        pullDistance: 0,
        iconStatus: 'Checking...',

        async init() {
            marked.setOptions({ gfm: true, breaks: true });
            window.addEventListener('online', () => { this.isOnline = true; this.syncPending(); });
            window.addEventListener('offline', () => { this.isOnline = false; });
            const cached = localStorage.getItem('todo_cache');
            if (cached) this.todos = JSON.parse(cached);
            
            fetch('/icon.jpg').then(r => this.iconStatus = r.ok ? 'FOUND' : '404 NOT FOUND').catch(e => this.iconStatus = 'ERROR');

            await this.fetchTodos();
            this.syncPending();
        },

        touchStart(e) { 
            if (window.scrollY > 10) return; 
            this.startY = e.touches ? e.touches[0].pageY : e.pageY; 
        },

        touchMove(e) { 
            if (window.scrollY > 10 || this.startY === 0) return; 
            const y = e.touches ? e.touches[0].pageY : e.pageY; 
            this.pullDistance = Math.max(0, y - this.startY); 
            if (this.pullDistance > 20) e.preventDefault(); 
        },

        async touchEnd() { 
            if (this.pullDistance > 80) await this.fetchTodos(); 
            this.startY = 0; 
            this.pullDistance = 0; 
        },

        sanitizeTodo(t) { 
            return { ...t, isPending: t.isPending || false, description: t.description || '', subtasks: Array.isArray(t.subtasks) ? t.subtasks : [] }; 
        },

        async fetchTodos() {
            if (!this.isOnline) return;
            const { data, error } = await supabaseClient.from('todos').select('*').order('created_at', { ascending: false });
            if (!error) {
                const pendingTasks = this.todos.filter(t => t.isPending);
                const serverTasks = data.map(t => this.sanitizeTodo(t));
                this.todos = [...pendingTasks, ...serverTasks];
                localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            }
        },

        async syncPending() {
            if (!this.isOnline || this.isSyncing) return;
            this.isSyncing = true;
            try {
                const pending = this.todos.filter(t => t.isPending);
                for (const task of pending) {
                    const { data, error } = await supabaseClient.from('todos').insert([{ task: task.task, description: task.description || '', category: task.category || 'General', importance: task.importance || 2, is_completed: task.is_completed || false, subtasks: task.subtasks || [] }]).select();
                    if (!error && data?.length > 0) {
                        const index = this.todos.findIndex(t => t.id === task.id);
                        if (index !== -1) { this.todos[index] = this.sanitizeTodo(data[0]); localStorage.setItem('todo_cache', JSON.stringify(this.todos)); }
                    }
                }
            } finally { this.isSyncing = false; if (this.todos.some(t => t.isPending)) this.syncPending(); }
        },

        applyCategory(cat) { 
            this.newTodo = this.newTodo.replace(/#\w+/g, '').trim() + ' #' + cat; 
        },

        async addTodo() {
            if (!this.newTodo.trim()) return;
            let taskText = this.newTodo, category = 'General';
            const hashMatch = taskText.match(/#(\w+)/);
            if (hashMatch) { category = hashMatch[1]; taskText = taskText.replace(hashMatch[0], '').trim(); }
            const newObj = { id: 'temp-' + Date.now(), task: taskText, description: this.newDescription || '', category: category, importance: parseInt(this.newImportance), is_completed: false, isPending: true, created_at: new Date().toISOString(), subtasks: [] };
            this.todos.unshift(newObj);
            localStorage.setItem('todo_cache', JSON.stringify(this.todos));
            this.newTodo = ''; this.newDescription = ''; this.inputFocused = false;
            if (this.isOnline) this.syncPending();
        },

        get activeTasks() { return this.sortItems(this.todos.filter(t => !t.is_completed)); },
        get completedTasks() { return this.sortItems(this.todos.filter(t => t.is_completed)); },

        sortItems(items) { 
            return items.sort((a, b) => { if (this.sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at); if (this.sortBy === 'importance') return b.importance - a.importance; return 0; }); 
        },

        get uniqueCategories() { 
            return [...new Set(this.todos.map(t => t.category).filter(c => c && c !== 'General'))].sort(); 
        },

        getTagColor(category) {
            const colors = ['bg-blue-50 text-blue-600', 'bg-indigo-50 text-indigo-600', 'bg-emerald-50 text-emerald-600', 'bg-rose-50 text-rose-600', 'bg-amber-50 text-amber-600', 'bg-cyan-50 text-cyan-600', 'bg-pink-50 text-pink-600', 'bg-violet-50 text-violet-600', 'bg-lime-50 text-lime-600', 'bg-orange-50 text-orange-600', 'bg-teal-50 text-teal-600', 'bg-fuchsia-50 text-fuchsia-600', 'bg-sky-50 text-sky-600', 'bg-slate-100 text-slate-600', 'bg-purple-50 text-purple-600', 'bg-red-50 text-red-600', 'bg-green-50 text-green-600', 'bg-zinc-100 text-zinc-600', 'bg-neutral-100 text-neutral-600', 'bg-stone-100 text-stone-600'];
            let hash = 0; for (let i = 0; i < (category || '').length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
            return colors[Math.abs(hash) % colors.length];
        },

        openReadMode(todo) { this.activeTodo = todo; this.tempSubTitle = ''; this.tempSubDesc = ''; this.editingDesc = false; document.body.style.overflow = 'hidden'; },
        closeReadMode() { this.activeTodo = null; document.body.style.overflow = 'auto'; },

        async addRichSubtask(todo) { 
            if (!this.tempSubTitle.trim()) return; 
            if (!Array.isArray(todo.subtasks)) todo.subtasks = []; 
            todo.subtasks.push({ text: this.tempSubTitle, description: this.tempSubDesc, done: false }); 
            this.tempSubTitle = ''; this.tempSubDesc = ''; 
            await this.updateSubtasks(todo); 
        },

        async removeSubtask(todo, index) { 
            todo.subtasks.splice(index, 1); 
            await this.updateSubtasks(todo); 
        },

        async updateSubtasks(todo) { 
            localStorage.setItem('todo_cache', JSON.stringify(this.todos)); 
            if (this.isOnline && !todo.isPending) { await supabaseClient.from('todos').update({ subtasks: todo.subtasks }).eq('id', todo.id); } 
        },

        async updateMainTask(todo) { 
            localStorage.setItem('todo_cache', JSON.stringify(this.todos)); 
            if (this.isOnline && !todo.isPending) { await supabaseClient.from('todos').update({ task: todo.task, description: todo.description, category: todo.category, importance: todo.importance }).eq('id', todo.id); } 
        },

        async toggleTodo(todo) { 
            todo.is_completed = !todo.is_completed; 
            localStorage.setItem('todo_cache', JSON.stringify(this.todos)); 
            if (this.isOnline && !todo.isPending) await supabaseClient.from('todos').update({ is_completed: todo.is_completed }).eq('id', todo.id); 
        },

        async deleteTodo(id) { 
            if (confirm("Delete?")) { 
                this.todos = this.todos.filter(t => t.id !== id); 
                localStorage.setItem('todo_cache', JSON.stringify(this.todos)); 
                if (this.isOnline && !id.toString().startsWith('temp')) await supabaseClient.from('todos').delete().eq('id', id); 
            } 
        }
    }
}