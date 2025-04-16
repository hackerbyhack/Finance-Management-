

'use strict';

// ====================================
// Utility Functions
// ====================================

/** Debounce function */
function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

/** Generate unique ID */
const generateId = (prefix = 'item') => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

// ====================================
// Central State Management
// ====================================

const StateManager = (() => {
    const LOCAL_STORAGE_KEY = 'finTrackProData_v3.1'; // Version bump for potential structure changes

    // Default state structure
    const getDefaultState = () => ({
        transactions: [],
        goals: [],
        notes: [],
        budgets: {
            overall: null, // { amount: number }
            categories: {}, // { 'categoryName': { amount: number } }
        },
        settings: {
            theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
            currency: { symbol: '₹', code: 'INR' },
            categories: ['Food', 'Transport', 'Utilities', 'Salary', 'Entertainment', 'Shopping', 'Health', 'Other Expense', 'Other Income'].sort(), // Keep sorted
            recurringTemplates: [], // { id, description, amount, category } - Store template details
        },
        // Persistent UI preferences
        uiPreferences: {
            activeSection: 'dashboard',
            isSidebarCollapsed: false, // User's desktop preference
        },
        // Transient UI state (not saved)
        uiTransient: {
            isMobile: window.innerWidth <= 991.98,
            filters: { type: 'all', category: 'all', dateStart: '', dateEnd: '', searchTerm: '' },
            sort: { key: 'date', direction: 'desc' },
            notesSearchTerm: '',
            editingItemId: null,
            isLoading: false, // Global loading indicator? Maybe too broad.
        }
    });

    let state = getDefaultState();

    const getState = () => JSON.parse(JSON.stringify(state)); // Deep copy for safety
    const getSettings = () => state.settings;
    const getUiPreferences = () => state.uiPreferences;
    const getUiTransient = () => state.uiTransient;

    // --- State Updaters ---
    const updateTransactions = (newTransactions) => { state.transactions = newTransactions; };
    const addTransaction = (transaction) => { state.transactions.push(transaction); };
    const updateTransaction = (updatedTx) => {
        const index = state.transactions.findIndex(tx => tx.id === updatedTx.id);
        if (index !== -1) {
            state.transactions[index] = { ...state.transactions[index], ...updatedTx }; // Merge updates
        }
    };
    const deleteTransaction = (id) => { state.transactions = state.transactions.filter(tx => tx.id !== id); };

    const updateGoals = (newGoals) => { state.goals = newGoals; };
    const addGoal = (goal) => { state.goals.push(goal); };
    const deleteGoal = (id) => { state.goals = state.goals.filter(g => g.id !== id); };

    const updateNotes = (newNotes) => { state.notes = newNotes; };
    const addNote = (note) => { state.notes.push(note); };
    const deleteNote = (id) => { state.notes = state.notes.filter(n => n.id !== id); };

    const updateBudgets = (newBudgets) => { state.budgets = { ...state.budgets, ...newBudgets }; };
    const setOverallBudget = (amount) => { state.budgets.overall = amount !== null && !isNaN(amount) && amount >= 0 ? { amount } : null; };
    const setCategoryBudget = (category, amount) => {
        if (category && amount !== null && !isNaN(amount) && amount >= 0) {
            state.budgets.categories[category] = { amount };
        } else if (category) {
            delete state.budgets.categories[category]; // Remove if amount is invalid/null
        }
    };
    const deleteCategoryBudget = (category) => { delete state.budgets.categories[category]; };

    const updateSettings = (newSettings) => { state.settings = { ...state.settings, ...newSettings }; };
    const addCategory = (category) => {
        const trimmedCategory = category?.trim();
        if (trimmedCategory && !state.settings.categories.some(c => c.toLowerCase() === trimmedCategory.toLowerCase())) {
            state.settings.categories.push(trimmedCategory);
            state.settings.categories.sort(); // Keep sorted
            return true; // Indicate addition
        }
        return false; // Indicate no change
    };
    const deleteCategory = (category) => {
        const originalLength = state.settings.categories.length;
        state.settings.categories = state.settings.categories.filter(c => c.toLowerCase() !== category.toLowerCase());
        deleteCategoryBudget(category); // Also remove budget
        console.log(`Category '${category}' deleted. Associated transactions remain.`);
        return state.settings.categories.length < originalLength; // Indicate deletion
    };
    const addRecurringTemplate = (template) => { state.settings.recurringTemplates.push(template); };
    const removeRecurringTemplate = (originalId) => { state.settings.recurringTemplates = state.settings.recurringTemplates.filter(t => t.id !== originalId); };

    const updateUiPreferences = (newPrefs) => { state.uiPreferences = { ...state.uiPreferences, ...newPrefs }; };
    const updateUiTransient = (newTransient) => { state.uiTransient = { ...state.uiTransient, ...newTransient }; };

    // --- Persistence ---
    const saveState = async () => {
        try {
            // Define which parts of the state are persistent
            const stateToSave = {
                transactions: state.transactions,
                goals: state.goals,
                notes: state.notes,
                budgets: state.budgets,
                settings: state.settings,
                uiPreferences: state.uiPreferences, // Save user preferences
            };
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
        } catch (error) {
            console.error('Error saving state:', error);
            UIManager.showToast('Failed to save data. Storage might be full.', 'error');
        }
    };

    const loadState = async () => {
        try {
            const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                const defaultState = getDefaultState(); // Get defaults for merging

                // Merge carefully, ensuring data structure integrity
                state.transactions = parsedData.transactions || [];
                state.goals = parsedData.goals || [];
                state.notes = parsedData.notes || [];
                state.budgets = {
                    overall: parsedData.budgets?.overall || defaultState.budgets.overall,
                    categories: parsedData.budgets?.categories || defaultState.budgets.categories
                };
                state.settings = {
                    ...defaultState.settings,
                    ...(parsedData.settings || {}),
                    currency: parsedData.settings?.currency || defaultState.settings.currency,
                    categories: Array.isArray(parsedData.settings?.categories) && parsedData.settings.categories.length > 0
                                ? [...new Set(parsedData.settings.categories)].sort() // Deduplicate and sort
                                : defaultState.settings.categories,
                    recurringTemplates: parsedData.settings?.recurringTemplates || []
                };
                state.uiPreferences = {
                    ...defaultState.uiPreferences,
                    ...(parsedData.uiPreferences || {})
                };
                // Reset transient state on load
                state.uiTransient = getDefaultState().uiTransient;
                console.log('State loaded successfully.');
            } else {
                console.log(`No saved data found (${LOCAL_STORAGE_KEY}), using defaults.`);
                state = getDefaultState();
                UIManager.applyTheme(state.settings.theme); // Apply default theme on first load
            }
        } catch (error) {
            console.error('Error loading state:', error);
            UIManager.showToast('Failed to load saved data. Using default settings.', 'error');
            localStorage.removeItem(LOCAL_STORAGE_KEY); // Clear potentially corrupted data
            state = getDefaultState();
        }
    };

    // --- Data Management Actions ---
    const clearAllData = async () => {
        if (await UIManager.showConfirm('DANGER! Are you sure you want to delete ALL your data? This action cannot be undone!')) {
            try {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                const currentTheme = state.settings.theme; // Preserve theme
                state = getDefaultState(); // Reset state completely
                state.settings.theme = currentTheme; // Re-apply theme
                await saveState(); // Save the cleared state
                UIManager.applyTheme(currentTheme); // Apply theme visually
                // Navigate and force full UI reload
                AppController.navigateToSection('dashboard', true);
                UIManager.showToast('All data cleared successfully.', 'success');
                return true;
            } catch (error) {
                console.error('Error clearing data:', error);
                UIManager.showToast('Failed to clear data.', 'error');
                return false;
            }
        }
        return false;
    };

    const backupData = () => {
        try {
            const stateToBackup = { // Only include persistent data
                transactions: state.transactions,
                goals: state.goals,
                notes: state.notes,
                budgets: state.budgets,
                settings: state.settings,
                uiPreferences: state.uiPreferences,
            };
            const dataStr = JSON.stringify(stateToBackup, null, 2); // Pretty print
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const date = new Date().toISOString().slice(0, 10);
            link.download = `fintrack-pro-backup-${date}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            UIManager.showToast('Data backup download initiated.', 'success');
        } catch (error) {
            console.error('Error creating backup:', error);
            UIManager.showToast('Failed to create backup file.', 'error');
        }
    };

    const restoreData = async (file) => {
        if (!file || file.type !== 'application/json') {
            UIManager.showToast('Please select a valid JSON backup file (.json).', 'warning');
            return false;
        }
        if (!await UIManager.showConfirm('Restoring data will OVERWRITE your current data. Are you sure you want to proceed?')) {
            return false;
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const restoredData = JSON.parse(event.target.result);
                    // Basic validation
                    if (!restoredData || typeof restoredData !== 'object' || !Array.isArray(restoredData.transactions) || !restoredData.settings) {
                        throw new Error("Invalid backup file structure.");
                    }

                    const defaultState = getDefaultState(); // For merging missing pieces

                    // Restore state carefully
                    state.transactions = restoredData.transactions || [];
                    state.goals = restoredData.goals || [];
                    state.notes = restoredData.notes || [];
                    state.budgets = { ...defaultState.budgets, ...(restoredData.budgets || {}) };
                    state.settings = {
                        ...defaultState.settings,
                        ...(restoredData.settings || {}),
                        currency: restoredData.settings?.currency || defaultState.settings.currency,
                         categories: Array.isArray(restoredData.settings?.categories)
                                     ? [...new Set(restoredData.settings.categories)].sort() // Dedupe/Sort
                                     : defaultState.settings.categories,
                        recurringTemplates: restoredData.settings?.recurringTemplates || []
                    };
                    state.uiPreferences = { ...defaultState.uiPreferences, ...(restoredData.uiPreferences || {}) };
                    state.uiTransient = defaultState.uiTransient; // Reset transient

                    await saveState();
                    UIManager.applyTheme(state.settings.theme); // Apply restored theme
                    UIManager.updateCurrencyDisplay();
                    // Force reload UI from restored state
                    AppController.navigateToSection(state.uiPreferences.activeSection || 'dashboard', true);
                    UIManager.showToast('Data restored successfully!', 'success');
                    resolve(true);
                } catch (error) {
                    console.error('Error restoring data:', error);
                    UIManager.showToast(`Failed to restore data: ${error.message}`, 'error');
                    reject(error);
                }
            };
            reader.onerror = (error) => {
                UIManager.showToast('Error reading the backup file.', 'error');
                console.error('File reading error:', error);
                reject(error);
            };
            reader.readAsText(file);
        });
    };

    return {
        getState, getSettings, getUiPreferences, getUiTransient,
        // Modifiers (trigger save/UI update via AppController)
        updateTransactions, addTransaction, updateTransaction, deleteTransaction,
        updateGoals, addGoal, deleteGoal,
        updateNotes, addNote, deleteNote,
        updateBudgets, setOverallBudget, setCategoryBudget, deleteCategoryBudget,
        updateSettings, addCategory, deleteCategory, addRecurringTemplate, removeRecurringTemplate,
        updateUiPreferences, updateUiTransient,
        // Persistence & Data Management
        saveState, loadState, clearAllData, backupData, restoreData
    };
})();


// ====================================
// UI Management & Rendering
// ====================================

const UIManager = (() => {
    // Cached Selectors
    const selectors = {
        body: document.body,
        metaThemeColor: document.getElementById('meta-theme-color'),
        notificationArea: document.getElementById('notification-area'),
        appDialogs: document.querySelectorAll('.app-dialog'),
        confirmDialog: {
            dialog: document.getElementById('confirm-dialog'),
            title: document.getElementById('confirm-dialog-title'),
            message: document.getElementById('confirm-dialog-message'),
            yes: document.getElementById('confirm-dialog-yes'),
            no: document.getElementById('confirm-dialog-no'),
        },
        sidebar: {
            nav: document.getElementById('sidebar'),
            toggleBtn: document.getElementById('sidebar-toggle'),
            navLinks: document.querySelectorAll('.nav-link'),
        },
        mainContent: document.getElementById('main-content'),
        sections: document.querySelectorAll('.app-section'),
        currentYear: document.getElementById('current-year'),
        dashboard: {
            totalIncome: document.getElementById('db-total-income'),
            totalExpense: document.getElementById('db-total-expense'),
            currentBalance: document.getElementById('db-current-balance'),
            recentTransactions: document.getElementById('db-recent-transactions'),
            goalProgress: document.getElementById('db-goal-progress'),
            budgetSummary: document.getElementById('db-budget-summary'),
            activeGoalsCount: document.getElementById('db-active-goals-count'),
            monthlySpendingChart: document.getElementById('monthly-spending-chart'),
            noSpendingDataMsg: document.getElementById('db-no-spending-data'),
        },
        finance: {
            totalIncome: document.getElementById('fin-total-income'),
            totalExpense: document.getElementById('fin-total-expense'),
            currentBalance: document.getElementById('fin-current-balance'),
            summaryNote: document.getElementById('fin-summary-note'),
            transactionForm: document.getElementById('transaction-form'),
            descriptionInput: document.getElementById('description'),
            amountInput: document.getElementById('amount'),
            categoryInput: document.getElementById('category'),
            categorySuggestions: document.getElementById('category-suggestions'),
            dateInput: document.getElementById('date'),
            recurringCheckbox: document.getElementById('recurring'),
            transactionList: document.getElementById('transaction-list'),
            transactionCount: document.getElementById('transaction-count'),
            expenseChartCanvas: document.getElementById('expense-chart'),
            noExpenseDataMsg: document.getElementById('no-expense-data'),
            filterType: document.getElementById('filter-type'),
            filterCategory: document.getElementById('filter-category'),
            filterDateStart: document.getElementById('filter-date-start'),
            filterDateEnd: document.getElementById('filter-date-end'),
            searchTransactions: document.getElementById('search-transactions'),
            sortTransactions: document.getElementById('sort-transactions'),
            resetFiltersBtn: document.getElementById('reset-filters-btn'),
            filterActiveIndicator: document.getElementById('filter-active-indicator'),
            editDialog: {
                dialog: document.getElementById('edit-transaction-dialog'),
                form: document.getElementById('edit-transaction-form'),
                id: document.getElementById('edit-transaction-id'),
                description: document.getElementById('edit-description'),
                amount: document.getElementById('edit-amount'),
                category: document.getElementById('edit-category'),
                categorySuggestions: document.getElementById('edit-category-suggestions'),
                date: document.getElementById('edit-date'),
            },
        },
        budgets: {
            overallForm: document.getElementById('overall-budget-form'),
            overallAmountInput: document.getElementById('overall-budget-amount'),
            overallSummary: document.getElementById('overall-budget-summary'),
            overallSaveBtn: document.getElementById('save-overall-budget-btn'),
            categoryForm: document.getElementById('category-budget-form'),
            categorySelect: document.getElementById('category-budget-select'),
            newCategoryNameInput: document.getElementById('new-category-budget-name'),
            categoryAmountInput: document.getElementById('category-budget-amount'),
            categoryList: document.getElementById('category-budget-list'),
            categoryAddBtn: document.getElementById('add-category-budget-btn'),
        },
        goals: {
            form: document.getElementById('goal-form'),
            list: document.getElementById('goal-list'),
            descriptionInput: document.getElementById('goal-description'),
            targetInput: document.getElementById('goal-target'),
            addBtn: document.getElementById('add-goal-btn'),
        },
        notes: {
            form: document.getElementById('note-form'),
            textInput: document.getElementById('note-text'),
            charCount: document.getElementById('note-char-count'),
            list: document.getElementById('notes-list'),
            searchInput: document.getElementById('search-notes-input'),
            addBtn: document.getElementById('add-note-btn'),
        },
        settings: {
            themeToggleBtn: document.getElementById('theme-toggle'),
            currencySelect: document.getElementById('currency-select'),
            newCategoryInput: document.getElementById('new-custom-category'),
            addCategoryBtn: document.getElementById('add-custom-category-btn'),
            categoryList: document.getElementById('custom-category-list'),
            backupBtn: document.getElementById('backup-data-btn'),
            restoreInput: document.getElementById('restore-data-input'),
            restoreBtn: document.getElementById('restore-data-btn'),
            clearBtn: document.getElementById('clear-all-data-btn'),
        }
    };

    let expenseChartInstance = null;
    let monthlySpendingChartInstance = null;
    let confirmDialogResolver = null;
    const MOBILE_BREAKPOINT = 991.98;

    

    // --- Formatting Helpers ---
    const getFormatter = () => {
        const { symbol, code } = StateManager.getSettings().currency;
        try {
            return new Intl.NumberFormat(navigator.language || 'en-IN', {
                style: 'currency', currency: code || 'INR', currencyDisplay: 'symbol',
                minimumFractionDigits: 2, maximumFractionDigits: 2,
            });
        } catch (e) {
            console.warn("Intl.NumberFormat error. Falling back.", e);
            return { format: (amount) => `${symbol}${amount.toFixed(2)}` };
        }
    };

    const formatCurrency = (amount) => {
        amount = Number(amount); // Ensure it's a number
        return getFormatter().format(isNaN(amount) ? 0 : amount);
    };

    const formatDate = (dateString) => {
        if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return 'N/A';
        try {
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(Date.UTC(year, month - 1, day));
            return new Intl.DateTimeFormat(navigator.language || 'en-GB', {
                year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC'
            }).format(date);
        } catch (e) {
            console.warn("Error formatting date:", dateString, e);
            return dateString;
        }
    };

     const formatDateTime = (timestamp) => {
        if (!timestamp || typeof timestamp !== 'number') return 'N/A';
        try {
            return new Intl.DateTimeFormat(navigator.language || 'en-US', {
                dateStyle: 'short', timeStyle: 'short' // Shorter format
            }).format(new Date(timestamp));
        } catch(e) {
            console.warn("Error formatting datetime:", timestamp, e);
            return new Date(timestamp).toLocaleString(); // Fallback
        }
    };

    // --- DOM Manipulation Helpers ---
    const renderList = (container, items, renderItemFn, noDataMsg = "No data available.") => {
        if (!container) return;
        container.innerHTML = ''; // Clear previous content
        if (!items || items.length === 0) {
            container.innerHTML = `<li class="list-placeholder">${noDataMsg}</li>`;
            return;
        }
        const fragment = document.createDocumentFragment();
        items.forEach((item, index) => {
             // Pass index for staggered animations
            const element = renderItemFn(item, index);
            if (element instanceof Node) {
                fragment.appendChild(element);
            }
        });
        container.appendChild(fragment);
    };

    const createDOMElement = (htmlString) => {
        const template = document.createElement('template');
        template.innerHTML = htmlString.trim();
        return template.content.firstChild;
    };

    // --- UI Feedback: Toast Notifications ---
    const showToast = (message, type = 'info', duration = 4000) => {
        if (!selectors.notificationArea) return;

        const toastId = generateId('toast');
        const toast = createDOMElement(`
            <div class="toast-notification toast-${type}" id="${toastId}" role="alert" aria-live="assertive">
                <span class="toast-message">${message}</span>
                <button type="button" class="close-toast" aria-label="Close notification">&times;</button>
            </div>
        `);

        const closeButton = toast.querySelector('.close-toast');
        let removalTimeout;

        const removeToast = () => {
            clearTimeout(removalTimeout);
            toast.classList.add('is-leaving'); // Add class for fade-out animation
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
        };

        closeButton?.addEventListener('click', removeToast, { once: true });
        selectors.notificationArea.appendChild(toast);

        removalTimeout = setTimeout(removeToast, duration); // Auto-dismiss
    };

    // --- UI Feedback: Modal Dialogs ---
    const showDialog = (dialogId) => {
        const dialog = document.getElementById(dialogId);
        if (dialog && typeof dialog.showModal === 'function') {
            dialog.classList.remove('is-closing'); // Remove closing class if re-opening quickly
            dialog.showModal();
        } else {
            console.error(`Dialog element #${dialogId} not found or <dialog> not supported.`);
        }
    };

    const closeDialog = (dialogId) => {
        const dialog = document.getElementById(dialogId);
        if (dialog && typeof dialog.close === 'function') {
            dialog.classList.add('is-closing'); // Add class for closing animation
            dialog.addEventListener('animationend', () => {
                 dialog.classList.remove('is-closing');
                 if (dialog.open) dialog.close(); // Only close if it's still considered open
                 // Reset editing state only after closing animation
                 StateManager.updateUiTransient({ editingItemId: null });
            }, { once: true });
        }
    };

    const setupDialogCloseHandlers = () => {
        selectors.appDialogs.forEach(dialog => {
            dialog.addEventListener('click', (e) => {
                if (e.target === dialog) closeDialog(dialog.id); // Backdrop click
                if (e.target.closest('[data-close-dialog]')) closeDialog(dialog.id); // Button click
            });
            dialog.addEventListener('close', () => { // Reset form on native close event
                const form = dialog.querySelector('form');
                if (form && form.method === 'dialog') form.reset(); // Standard reset for method="dialog"
            });
        });
    };

    // --- UI Feedback: Confirmation Dialog ---
    const showConfirm = (message, title = 'Confirm Action') => {
        const confirm = selectors.confirmDialog;
        return new Promise((resolve) => {
           if (!confirm.dialog || !confirm.yes || !confirm.no) {
                console.error("Confirmation dialog elements not found. Automatically rejecting.");
                resolve(false);
                return;
            }
           confirm.title.textContent = title;
           confirm.message.textContent = message;

           // Clean up previous listeners robustly
           const newYes = confirm.yes.cloneNode(true);
           confirm.yes.parentNode.replaceChild(newYes, confirm.yes);
           confirm.yes = newYes;

           const newNo = confirm.no.cloneNode(true);
           confirm.no.parentNode.replaceChild(newNo, confirm.no);
           confirm.no = newNo;

           // Define resolver function
           confirmDialogResolver = (value) => {
               closeDialog('confirm-dialog');
               resolve(value);
           };

            // Add new listeners
            confirm.yes.addEventListener('click', () => confirmDialogResolver(true), { once: true });
            confirm.no.addEventListener('click', () => confirmDialogResolver(false), { once: true });

            showDialog('confirm-dialog');
        });
    };

    // --- Theme Management ---
    const applyTheme = (theme) => {
       selectors.body.dataset.theme = theme;
       const themeColor = theme === 'dark' ? '#0b1120' : '#2563eb'; // Darker dark, lighter light blue
       selectors.metaThemeColor?.setAttribute('content', themeColor);
       if (selectors.settings.themeToggleBtn) {
           selectors.settings.themeToggleBtn.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
           selectors.settings.themeToggleBtn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`);
       }
        // Re-render charts with new theme colors if they exist and are visible
        const activeSection = StateManager.getUiPreferences().activeSection;
        if (expenseChartInstance && activeSection === 'finance') {
            renderExpenseChart(StateManager.getState().transactions);
        }
        if (monthlySpendingChartInstance && activeSection === 'dashboard') {
             renderMonthlySpendingChart(StateManager.getState().transactions);
        }
    };

    // --- Currency Management ---
    const updateCurrencyDisplay = () => {
        const state = StateManager.getState();
        const prefs = StateManager.getUiPreferences();
        renderGlobalSummary(); // Update main summary figures first

        // Update section-specific elements
        switch (prefs.activeSection) {
           case 'dashboard':
               renderRecentTransactions(state.transactions);
               renderDashboardGoalProgress(state.goals, state.transactions);
               renderDashboardBudgetSummary(state.budgets, state.transactions);
               break;
           case 'finance':
               renderTransactionList(state.transactions); // Includes filtered summary
               break;
           case 'budgets':
               renderOverallBudget(state.budgets, state.transactions);
               renderCategoryBudgets(state.budgets, state.transactions, state.settings.categories);
               break;
           case 'goals':
               renderGoalsList(state.goals, state.transactions);
               break;
           case 'settings':
               if (selectors.settings.currencySelect) {
                   selectors.settings.currencySelect.value = state.settings.currency.symbol;
               }
               break;
       }
    };

    // --- Sidebar Management ---
    const setSidebarState = (forceState = null) => {
        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        StateManager.updateUiTransient({ isMobile }); // Keep track of mobile state
        const currentDesktopPref = StateManager.getUiPreferences().isSidebarCollapsed;

        if (isMobile) {
            // Mobile: Off-canvas behavior
            const shouldBeOpen = forceState ?? !selectors.body.classList.contains('sidebar-open');
            selectors.sidebar.nav?.classList.toggle('open', shouldBeOpen);
            selectors.body.classList.toggle('sidebar-open', shouldBeOpen);
            selectors.sidebar.nav?.classList.remove('collapsed'); // Ensure desktop style inactive
            selectors.mainContent.style.marginLeft = '';
            selectors.sidebar.toggleBtn?.setAttribute('aria-expanded', shouldBeOpen.toString());
        } else {
            // Desktop: Collapsible behavior based on user preference
            const shouldBeCollapsed = forceState ?? currentDesktopPref;
            selectors.sidebar.nav?.classList.toggle('collapsed', shouldBeCollapsed);
            selectors.mainContent.style.marginLeft = shouldBeCollapsed
                ? 'var(--sidebar-width-collapsed, 80px)'
                : 'var(--sidebar-width, 260px)';
            selectors.sidebar.nav?.classList.remove('open'); // Ensure mobile style inactive
            selectors.body.classList.remove('sidebar-open');
            selectors.sidebar.toggleBtn?.setAttribute('aria-expanded', (!shouldBeCollapsed).toString());
            // Preference is updated only on explicit user toggle in AppController
        }
    };

    // --- Filter State Indicator ---
     const updateFilterIndicator = () => {
         const { filters } = StateManager.getUiTransient();
         const isActive = filters.type !== 'all' || filters.category !== 'all' || filters.dateStart || filters.dateEnd || filters.searchTerm;
         if (selectors.finance.filterActiveIndicator) {
             selectors.finance.filterActiveIndicator.style.display = isActive ? 'block' : 'none';
         }
          // Also update the summary note
          if(selectors.finance.summaryNote) {
              selectors.finance.summaryNote.textContent = isActive
                  ? 'Showing totals for currently filtered transactions.'
                  : 'Showing totals for all transactions.';
          }
     };

    // --- Chart Theming Helper ---
    const getChartThemeColors = () => {
        const style = getComputedStyle(document.documentElement);
        return {
            textColor: style.getPropertyValue('--text-primary').trim(),
            gridColor: style.getPropertyValue('--border-color').trim(),
            tooltipBg: style.getPropertyValue('--tooltip-bg').trim(),
            tooltipText: style.getPropertyValue('--tooltip-text').trim(),
            borderColor: style.getPropertyValue('--bg-secondary').trim(),
            chartColors: Array.from({ length: 8 }, (_, i) => style.getPropertyValue(`--chart-color-${i + 1}`).trim())
        };
    };


    // ================== Rendering Functions ==================

    // Render main summary figures (Dashboard only)
    const renderGlobalSummary = () => {
        const { transactions } = StateManager.getState();
        const summary = FinanceCalculator.calculateSummary(transactions); // Global summary

        const formattedIncome = formatCurrency(summary.totalIncome);
        const formattedExpense = formatCurrency(summary.totalExpense);
        const formattedBalance = formatCurrency(summary.currentBalance);

        // Dashboard Elements
        if (selectors.dashboard.totalIncome) selectors.dashboard.totalIncome.textContent = formattedIncome;
        if (selectors.dashboard.totalExpense) selectors.dashboard.totalExpense.textContent = formattedExpense;
        if (selectors.dashboard.currentBalance) selectors.dashboard.currentBalance.textContent = formattedBalance;
    };

     // Render FILTERED summary figures (Finance Section)
     const renderFilteredFinanceSummary = (filteredTransactions) => {
         const summary = FinanceCalculator.calculateSummary(filteredTransactions);
         const formattedIncome = formatCurrency(summary.totalIncome);
         const formattedExpense = formatCurrency(summary.totalExpense);
         const formattedBalance = formatCurrency(summary.currentBalance);

         if (selectors.finance.totalIncome) selectors.finance.totalIncome.textContent = formattedIncome;
         if (selectors.finance.totalExpense) selectors.finance.totalExpense.textContent = formattedExpense;
         if (selectors.finance.currentBalance) selectors.finance.currentBalance.textContent = formattedBalance;
         updateFilterIndicator(); // Show/hide indicator based on filters
     };

    // Render recent transactions list (Dashboard)
    const renderRecentTransactions = (transactions) => {
        if (!selectors.dashboard.recentTransactions) return;
        const recent = [...transactions]
            .sort((a, b) => new Date(b.date + 'T00:00:00Z') - new Date(a.date + 'T00:00:00Z'))
            .slice(0, 5);

        const renderItem = (t, index) => createDOMElement(`
            <li class="list-item recent-transaction-item" style="--list-item-index: ${index};">
                <span class="description">${t.description}</span>
                <span class="meta">${formatDate(t.date)}</span>
                <span class="amount ${t.amount >= 0 ? 'income' : 'expense'}">
                    ${formatCurrency(t.amount)}
                </span>
            </li>`);

        renderList(selectors.dashboard.recentTransactions, recent, renderItem, 'No recent transactions.');
    };

    // Render goal progress summary (Dashboard)
    const renderDashboardGoalProgress = (goals, transactions) => {
        const container = selectors.dashboard.goalProgress;
        if (!container) return;
        if (selectors.dashboard.activeGoalsCount) {
            selectors.dashboard.activeGoalsCount.textContent = goals.length;
        }

        if (goals.length === 0) {
            container.innerHTML = '<p class="text-muted">No active savings goals.</p>';
            return;
        }

        const summary = FinanceCalculator.calculateSummary(transactions);
        let goalHtml = '';
        goals.slice(0, 2).forEach((goal, index) => {
            const { progress, remaining } = FinanceCalculator.calculateGoalProgress(goal, summary.currentBalance);
            goalHtml += `
                <div class="goal-summary-item" style="--item-anim-delay: ${0.1 + index * 0.1}s;">
                    <strong>${goal.description}</strong>
                    <div class="progress-bar-container" title="${progress.toFixed(1)}% Complete. Target: ${formatCurrency(goal.target)}">
                        <div class="progress-bar goal-progress-bar" style="width: ${progress}%;"></div>
                    </div>
                    <small class="meta">Target: ${formatCurrency(goal.target)} | Remaining: ${formatCurrency(remaining)}</small>
                </div>
            `;
        });

        container.innerHTML = goalHtml;
    };

     // Render budget summary (Dashboard)
    const renderDashboardBudgetSummary = (budgets, transactions) => {
       const container = selectors.dashboard.budgetSummary;
       if (!container) return;
       let content = '';
       const monthlyExpenses = FinanceCalculator.calculateMonthlyExpenses(transactions);
       let itemCount = 0;

       // Overall Budget
        if (budgets.overall?.amount > 0) {
           const { spent, limit, percentage, isOver, remaining } = FinanceCalculator.calculateBudgetStatus(budgets.overall.amount, monthlyExpenses.total);
           content += `
               <div class="budget-summary-item" style="--item-anim-delay: ${0.1 + itemCount++ * 0.1}s;">
                   <strong>Overall Monthly</strong>
                   <div class="progress-bar-container budget-bar-container" title="${percentage.toFixed(1)}% Spent">
                       <div class="progress-bar budget-bar ${isOver ? 'over-budget' : ''}" style="width: ${percentage}%;"></div>
                   </div>
                    <small class="meta">Spent: ${formatCurrency(spent)} of ${formatCurrency(limit)} ${isOver ? '<strong class="expense">(Over!)</strong>' : `(${formatCurrency(remaining)} left)`}</small>
                </div>`;
       }

       // Top Category Budget
       const categoryBudgetEntries = Object.entries(budgets.categories)
            .map(([cat, data]) => ({ category: cat, ...data, spent: monthlyExpenses.byCategory[cat.toLowerCase()] || 0 }))
            .sort((a, b) => (b.spent / b.amount) - (a.spent / a.amount)); // Sort by % spent desc

       if (categoryBudgetEntries.length > 0 && itemCount < 2) { // Show top one if space
           const budget = categoryBudgetEntries[0];
            const { spent, limit, percentage, isOver, remaining } = FinanceCalculator.calculateBudgetStatus(budget.amount, budget.spent);
           content += `
                <div class="budget-summary-item" style="--item-anim-delay: ${0.1 + itemCount++ * 0.1}s;">
                   <strong>${budget.category}</strong>
                   <div class="progress-bar-container budget-bar-container" title="${percentage.toFixed(1)}% Spent">
                       <div class="progress-bar budget-bar ${isOver ? 'over-budget' : ''}" style="width: ${percentage}%;"></div>
                   </div>
                    <small class="meta">Spent: ${formatCurrency(spent)} of ${formatCurrency(limit)} ${isOver ? '<strong class="expense">(Over!)</strong>' : `(${formatCurrency(remaining)} left)`}</small>
                </div>`;
       }

       container.innerHTML = content || '<p class="text-muted">No active budgets set.</p>';
    };

     // Render Dashboard Monthly Spending Chart
     const renderMonthlySpendingChart = (transactions) => {
         const canvas = selectors.dashboard.monthlySpendingChart;
         const msg = selectors.dashboard.noSpendingDataMsg;
         if (!canvas || !msg) return;

         const ctx = canvas.getContext('2d');
         const theme = getChartThemeColors();
         const monthlyData = FinanceCalculator.calculateLastNMonthsSpending(transactions, 6); // Get last 6 months

         // Check if enough data
         const validDataPoints = monthlyData.data.filter(d => d > 0).length;
         const hasEnoughData = validDataPoints >= 2; // Need at least 2 points for a trend

         canvas.style.display = hasEnoughData ? 'block' : 'none';
         msg.style.display = hasEnoughData ? 'none' : 'block';

         // Destroy previous chart instance if exists
         if (monthlySpendingChartInstance) {
             monthlySpendingChartInstance.destroy();
             monthlySpendingChartInstance = null;
         }

         if (!hasEnoughData) return;

         // Create new chart instance
         monthlySpendingChartInstance = new Chart(ctx, {
             type: 'line',
             data: {
                 labels: monthlyData.labels, // Month names
                 datasets: [{
                     label: 'Total Spending',
                     data: monthlyData.data,
                     borderColor: theme.chartColors[0], // Use first chart color
                     backgroundColor: colorMix(theme.chartColors[0], 'transparent', 70), // Semi-transparent fill
                     borderWidth: 2,
                     pointBackgroundColor: theme.chartColors[0],
                     pointRadius: 4,
                     pointHoverRadius: 6,
                     tension: 0.3, // Smoother line
                     fill: true,
                 }]
             },
             options: {
                 responsive: true,
                 maintainAspectRatio: false,
                 scales: {
                     y: {
                         beginAtZero: true,
                         ticks: {
                             color: theme.textColor,
                              callback: (value) => formatCurrency(value).replace(/\.00$/, '') // Simpler labels
                         },
                         grid: { color: theme.gridColor }
                     },
                     x: {
                         ticks: { color: theme.textColor },
                         grid: { display: false } // Hide vertical grid lines
                     }
                 },
                 plugins: {
                     legend: { display: false }, // Hide legend for single dataset
                     tooltip: {
                         backgroundColor: theme.tooltipBg,
                         titleColor: theme.tooltipText,
                         bodyColor: theme.tooltipText,
                         callbacks: {
                             label: (context) => `Spending: ${formatCurrency(context.parsed.y)}`
                         }
                     }
                 }
             }
         });
     };


    // Render transaction list with filtering and sorting (Finance)
    const renderTransactionList = (transactions) => {
        const container = selectors.finance.transactionList;
        if (!container) return;
        const { filters, sort } = StateManager.getUiTransient();
        const { recurringTemplates } = StateManager.getSettings();

        const filtered = FinanceCalculator.filterAndSortTransactions(transactions, filters, sort);
        renderFilteredFinanceSummary(filtered); // Update summary based on filtered data

        // Update count display
        if (selectors.finance.transactionCount) {
            selectors.finance.transactionCount.textContent = `${filtered.length} Transaction${filtered.length !== 1 ? 's' : ''}`;
        }

        // --- Rendering Item ---
        const renderItem = (t, index) => {
            const isRecurringTemplateOrigin = recurringTemplates.some(tmpl => tmpl.id === t.id);
            const element = createDOMElement(`
                <li class="list-item transaction-item" data-id="${t.id}" tabindex="0" style="--list-item-index: ${index};">
                    <div class="transaction-icon">
                         <span class="${t.amount >= 0 ? 'income-icon' : 'expense-icon'}">
                            ${t.amount >= 0 ? '➕' : '➖'} {/* More distinct icons */}
                         </span>
                    </div>
                    <div class="transaction-details">
                        <span class="transaction-description">${t.description}</span>
                        <span class="transaction-meta">
                            ${formatDate(t.date)}
                            ${t.category ? ` <span class="badge category-badge">${t.category}</span>` : ''}
                        </span>
                    </div>
                    <span class="transaction-amount ${t.amount >= 0 ? 'income' : 'expense'}">
                        ${formatCurrency(t.amount)}
                    </span>
                    <div class="transaction-actions item-actions">
                         ${isRecurringTemplateOrigin ? `
                             <button type="button" class="action-btn recurring-btn" data-template-id="${t.id}" title="Add next occurrence from this template">🔁</button>
                         ` : ''}
                         <button type="button" class="action-btn edit-btn" data-id="${t.id}" title="Edit Transaction">✏️</button>
                         <button type="button" class="action-btn delete-btn" data-id="${t.id}" title="Delete Transaction">🗑️</button>
                    </div>
                </li>
            `);
            return element;
        };

        renderList(container, filtered, renderItem, filters.searchTerm ? 'No transactions match search.' : 'No matching transactions found.');
    };


    // Render expense distribution chart (Finance)
    const renderExpenseChart = (transactions) => {
        const canvas = selectors.finance.expenseChartCanvas;
        const msg = selectors.finance.noExpenseDataMsg;
        if (!canvas || !msg) return;

        const ctx = canvas.getContext('2d');
        const theme = getChartThemeColors();
        const { filters } = StateManager.getUiTransient(); // Use current filters

         // Aggregate expenses *from filtered transactions*
        const filteredExpenses = FinanceCalculator.filterAndSortTransactions(transactions, filters, { key: 'date', direction: 'desc' })
            .filter(t => t.amount < 0);
        const expenseData = FinanceCalculator.calculateExpenseByCategory(filteredExpenses);

        // Prepare data for Chart.js
        const sortedCategories = Object.entries(expenseData).sort(([, a], [, b]) => b.amount - a.amount);
        const labels = sortedCategories.map(([, data]) => data.label);
        const data = sortedCategories.map(([, data]) => data.amount);

        // Destroy previous chart instance if exists
        if (expenseChartInstance) {
            expenseChartInstance.destroy();
            expenseChartInstance = null;
        }

        // Handle no data state
        const hasData = labels.length > 0;
        canvas.style.display = hasData ? 'block' : 'none';
        msg.style.display = hasData ? 'none' : 'block';
        if (!hasData) return;

        // Create new chart instance
        expenseChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Expenses by Category',
                    data: data,
                    backgroundColor: theme.chartColors, // Cycle through theme colors
                    borderColor: theme.borderColor,
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: theme.textColor, padding: 15, boxWidth: 12, usePointStyle: true },
                    },
                    tooltip: {
                        backgroundColor: theme.tooltipBg,
                        titleColor: theme.tooltipText,
                        bodyColor: theme.tooltipText,
                        callbacks: {
                            label: (context) => {
                                const total = context.dataset.data.reduce((sum, value) => sum + value, 0);
                                const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${formatCurrency(context.parsed)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    };

    // Render Overall Budget section (Budgets)
    const renderOverallBudget = (budgets, transactions) => {
        const summaryEl = selectors.budgets.overallSummary;
        const inputEl = selectors.budgets.overallAmountInput;
        if (!summaryEl || !inputEl) return;

        const budget = budgets.overall;
        inputEl.value = budget?.amount ?? ''; // Set input value

        if (!budget?.amount > 0) {
            summaryEl.innerHTML = '<p class="text-muted">No overall monthly budget set.</p>';
            return;
        }

        const monthlyExpenses = FinanceCalculator.calculateMonthlyExpenses(transactions);
        const { spent, limit, percentage, isOver, remaining } = FinanceCalculator.calculateBudgetStatus(budget.amount, monthlyExpenses.total);

        summaryEl.innerHTML = `
            <h4>Current Status (This Month)</h4>
            <dl class="definition-list">
                <dt>Limit:</dt> <dd>${formatCurrency(limit)}</dd>
                <dt>Spent:</dt> <dd>${formatCurrency(spent)}</dd>
                <dt>Remaining:</dt> <dd><strong class="${isOver ? 'expense' : 'income'}">${formatCurrency(remaining)}</strong></dd>
            </dl>
            ${isOver ? '<p class="alert alert-warning">You are over your overall budget!</p>' : ''}
            <div class="progress-bar-container budget-bar-container" title="${percentage.toFixed(1)}% Spent">
                <div class="progress-bar budget-bar ${isOver ? 'over-budget' : ''}" style="width: ${percentage}%;"></div>
            </div>
        `;
    };

    // Render Category Budgets list and form state (Budgets)
    const renderCategoryBudgets = (budgets, transactions, allCategories) => {
        const listEl = selectors.budgets.categoryList;
        const selectEl = selectors.budgets.categorySelect;
        if (!listEl || !selectEl) return;

        const categoryBudgets = budgets.categories;
        const monthlyExpenses = FinanceCalculator.calculateMonthlyExpenses(transactions);

        // Populate Category Select Dropdown
        const currentSelection = selectEl.value;
        selectEl.innerHTML = '<option value="">-- Select Existing Category --</option>';
        allCategories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat; option.textContent = cat;
            selectEl.appendChild(option);
        });
        if (allCategories.includes(currentSelection)) { // Restore selection
            selectEl.value = currentSelection;
        }

        // Render the List
        const renderItem = (category, index) => {
            const budgetData = categoryBudgets[category];
            if (!budgetData) return null;

            const spent = monthlyExpenses.byCategory[category.toLowerCase()] || 0;
            const { limit, percentage, isOver, remaining } = FinanceCalculator.calculateBudgetStatus(budgetData.amount, spent);

            const element = createDOMElement(`
                <li class="list-item budget-item" data-category="${category}" style="--list-item-index: ${index};">
                     <div class="budget-info">
                         <strong>${category}</strong>
                         <div class="progress-bar-container budget-bar-container" title="${percentage.toFixed(1)}% Spent">
                             <div class="progress-bar budget-bar ${isOver ? 'over-budget' : ''}" style="width: ${percentage}%;"></div>
                         </div>
                         <small class="meta">Spent: ${formatCurrency(spent)} / ${formatCurrency(limit)}
                           ${isOver ? '<strong class="expense"> (Over!)</strong>' : ` (${formatCurrency(remaining)} left)`}
                         </small>
                     </div>
                     <div class="item-actions">
                         <button type="button" class="action-btn delete-btn delete-category-budget-btn" data-category="${category}" title="Delete Budget for ${category}">🗑️</button>
                     </div>
                 </li>
            `);
            return element;
        };

        const budgetKeys = Object.keys(categoryBudgets).sort();
        renderList(listEl, budgetKeys, renderItem, 'No category-specific budgets set yet.');
    };

    // Render Goals list (Goals)
    const renderGoalsList = (goals, transactions) => {
        const listEl = selectors.goals.list;
        if (!listEl) return;
        const summary = FinanceCalculator.calculateSummary(transactions);

        const renderItem = (g, index) => {
            const { progress, remaining } = FinanceCalculator.calculateGoalProgress(g, summary.currentBalance);
            const element = createDOMElement(`
                <li class="list-item goal-item" data-id="${g.id}" tabindex="0" style="--list-item-index: ${index};">
                    <div class="goal-details">
                        <h5>${g.description}</h5>
                        <p class="target">Target: ${formatCurrency(g.target)}</p>
                        <div class="progress-bar-container" title="${progress.toFixed(1)}% Complete">
                            <div class="progress-bar goal-progress-bar" style="width: ${progress}%;"></div>
                        </div>
                        <p class="goal-meta meta">
                            Progress: ${progress.toFixed(1)}% | Remaining: ${formatCurrency(remaining)}
                            ${g.createdAt ? `<br><small>Created: ${formatDate(g.createdAt)}</small>` : ''}
                        </p>
                    </div>
                    <div class="item-actions">
                        <button type="button" class="action-btn delete-btn delete-goal-btn" data-id="${g.id}" title="Delete Goal">🗑️</button>
                    </div>
                </li>
            `);
            return element;
        };
        renderList(listEl, goals, renderItem, 'No savings goals defined yet.');
    };

    // Render Notes list with search (Notes)
    const renderNotesList = (notes) => {
        const listEl = selectors.notes.list;
        if (!listEl) return;
        const searchTerm = StateManager.getUiTransient().notesSearchTerm.toLowerCase();

        const filteredNotes = notes.filter(n => n.text.toLowerCase().includes(searchTerm));
        const sortedNotes = filteredNotes.sort((a, b) => b.timestamp - a.timestamp); // Newest first

        const renderItem = (n, index) => {
            const formattedText = n.text
                .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") // Basic escaping
                .replace(/\n/g, '<br>'); // Newlines to <br>
            const element = createDOMElement(`
                <li class="list-item note-item" data-id="${n.id}" tabindex="0" style="--list-item-index: ${index};">
                    <div class="note-content">
                        <p>${formattedText}</p>
                        <small class="meta">Added: ${formatDateTime(n.timestamp)}</small>
                    </div>
                    <div class="item-actions">
                        <button type="button" class="action-btn delete-btn delete-note-btn" data-id="${n.id}" title="Delete Note">🗑️</button>
                    </div>
                </li>
            `);
            return element;
        };
       renderList(listEl, sortedNotes, renderItem, searchTerm ? 'No notes match your search.' : 'No notes added yet.');
   };

    // Render Category Management list & update related dropdowns/datalists
    const renderCategoryManagementList = (categories) => {
       // Settings List
       const listEl = selectors.settings.categoryList;
       if (listEl) {
           const renderItem = (cat, index) => createDOMElement(`
                   <li class="list-item category-manage-item" style="--list-item-index: ${index};">
                       <span>${cat}</span>
                       <button type="button" class="delete-category-btn action-btn delete-btn" data-category="${cat}" title="Delete '${cat}' Category">🗑️</button>
                   </li>
               `);
           renderList(listEl, categories.sort(), renderItem, 'No custom categories defined.');
       }

       // Update Datalists and Selects
       const sortedCategories = [...categories].sort();
       const categoryOptionsHtml = sortedCategories.map(cat => `<option value="${cat}">${cat}</option>`).join(''); // Add text content too for select
       const categoryDatalistHtml = sortedCategories.map(cat => `<option value="${cat}"></option>`).join('');

       // Transaction Form Category Datalist
       if (selectors.finance.categorySuggestions) {
           selectors.finance.categorySuggestions.innerHTML = categoryDatalistHtml;
       }
       // Edit Transaction Form Category Datalist
       if (selectors.finance.editDialog.categorySuggestions) {
            selectors.finance.editDialog.categorySuggestions.innerHTML = categoryDatalistHtml;
       }
       // Finance Filter Dropdown
       if (selectors.finance.filterCategory) {
           const currentFilter = selectors.finance.filterCategory.value;
           selectors.finance.filterCategory.innerHTML = `<option value="all">All Categories</option>${categoryOptionsHtml}`;
           selectors.finance.filterCategory.value = sortedCategories.includes(currentFilter) ? currentFilter : 'all';
       }
       // Budget Category Select (handled by renderCategoryBudgets call)
        if (StateManager.getUiPreferences().activeSection === 'budgets') {
            renderCategoryBudgets(StateManager.getState().budgets, StateManager.getState().transactions, sortedCategories);
        }
   };

    // --- Populate Edit Forms ---
    const populateEditTransactionForm = (transaction) => {
        const formEls = selectors.finance.editDialog;
        if (!transaction || !formEls.dialog) {
             showToast('Could not open edit form.', 'error'); return;
         }
        try {
             formEls.id.value = transaction.id;
             formEls.description.value = transaction.description;
             formEls.amount.value = transaction.amount;
             formEls.category.value = transaction.category || '';
             formEls.date.value = transaction.date;
             StateManager.updateUiTransient({ editingItemId: transaction.id });
             showDialog('edit-transaction-dialog');
        } catch (error) {
             console.error("Error populating edit transaction form:", error);
             showToast('Error loading data into edit form.', 'error');
        }
    };

    // Update character count for note input
     const updateNoteCharCount = () => {
         if(selectors.notes.textInput && selectors.notes.charCount) {
             const count = selectors.notes.textInput.value.length;
             const max = selectors.notes.textInput.maxLength || 500;
             selectors.notes.charCount.textContent = count;
             // Optional: Add styling if near/over limit
             selectors.notes.charCount.parentElement.classList.toggle('over-limit', count > max);
         }
     };

    // --- Global UI Update Trigger ---
    const updateUI = (section = StateManager.getUiPreferences().activeSection) => {
        const state = StateManager.getState();
        renderGlobalSummary(); // Always render global summary (Dashboard cards)

        try {
             renderCategoryManagementList(state.settings.categories); // Always update category lists/dropdowns

             switch (section) {
                 case 'dashboard':
                     renderRecentTransactions(state.transactions);
                     renderDashboardGoalProgress(state.goals, state.transactions);
                     renderDashboardBudgetSummary(state.budgets, state.transactions);
                     renderMonthlySpendingChart(state.transactions);
                     break;
                 case 'finance':
                     renderTransactionList(state.transactions); // Applies filters/sort, updates filtered summary
                     renderExpenseChart(state.transactions); // Uses filters from state
                     break;
                 case 'budgets':
                     renderOverallBudget(state.budgets, state.transactions);
                     // renderCategoryBudgets is called by renderCategoryManagementList
                     break;
                 case 'goals':
                     renderGoalsList(state.goals, state.transactions);
                     break;
                 case 'notes':
                     renderNotesList(state.notes);
                     break;
                 case 'settings':
                     if (selectors.settings.currencySelect) {
                         selectors.settings.currencySelect.value = state.settings.currency.symbol;
                     }
                     applyTheme(state.settings.theme); // Ensure theme button state is correct
                     break;
             }
        } catch (error) {
             console.error(`Error updating UI for section ${section}:`, error);
             showToast(`An error occurred while refreshing the ${section} view.`, 'error');
        }
    };

    // Public Methods
    return {
        selectors,
        init: () => {
            if (selectors.currentYear) selectors.currentYear.textContent = new Date().getFullYear();
            setupDialogCloseHandlers();
            setSidebarState(); // Initial sidebar state
            console.log("UIManager initialized.");
        },
        applyTheme,
        updateCurrencyDisplay,
        setSidebarState,
        showToast, showConfirm, showDialog, closeDialog,
        populateEditTransactionForm,
        updateUI,
        renderCategoryManagementList, // Expose for direct calls if needed
        updateNoteCharCount,
    };
})();


// ====================================
// Financial Calculation Logic
// ====================================
// Helper for color mixing in JS (basic approximation)
function colorMix(color1, color2, weight) {
    // Basic implementation for hex colors, assumes #RRGGBB
    const hexToRgb = (hex) => hex.match(/[A-Za-z0-9]{2}/g).map(v => parseInt(v, 16));
    const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

    try {
        const [r1, g1, b1] = hexToRgb(color1);
        const [r2, g2, b2] = hexToRgb(color2 === 'transparent' ? '#ffffff' : color2); // Approx transparent as white for mixing
        const w = weight / 100;

        const r = Math.round(r1 * (1 - w) + r2 * w);
        const g = Math.round(g1 * (1 - w) + g2 * w);
        const b = Math.round(b1 * (1 - w) + b2 * w);

        return rgbToHex(r, g, b);
    } catch (e) {
        console.warn("Color mix failed, returning color1", e);
        return color1; // Fallback
    }
}


const FinanceCalculator = (() => {
    /** Calculates global total income, total expense, and current balance. */
    const calculateSummary = (transactions) => {
        return transactions.reduce((acc, t) => {
            const amount = Number(t.amount);
            if (!isNaN(amount)) {
                 if (amount > 0) acc.totalIncome += amount;
                 else acc.totalExpense += Math.abs(amount);
            }
            return acc;
        }, { totalIncome: 0, totalExpense: 0, currentBalance: 0 });
        // Calculate balance at the end
        summary.currentBalance = summary.totalIncome - summary.totalExpense;
        return summary;
    };


    /** Calculates goal progress based on current balance. */
    const calculateGoalProgress = (goal, currentBalance) => {
        if (!goal || typeof goal.target !== 'number' || goal.target <= 0) {
             return { progress: 0, remaining: 0 };
        }
        const balanceContribution = Math.max(0, currentBalance);
        const progress = Math.min(100, (balanceContribution / goal.target) * 100);
        const remaining = Math.max(0, goal.target - balanceContribution);
        return { progress: progress || 0, remaining }; // Ensure progress is not NaN
    };

     /** Calculates budget status given a limit and amount spent */
     const calculateBudgetStatus = (limit, spent) => {
         limit = Number(limit) || 0;
         spent = Number(spent) || 0;
         const remaining = limit - spent;
         const percentage = limit > 0 ? Math.min((spent / limit) * 100, 100) : (spent > 0 ? 100 : 0);
         const isOver = spent > limit;
         return { spent, limit, remaining, percentage, isOver };
     };


    /** Calculates total expenses and expenses by category for the current month. */
    const calculateMonthlyExpenses = (transactions, date = new Date()) => {
        const currentMonth = date.getMonth();
        const currentYear = date.getFullYear();
        let total = 0;
        const byCategory = {}; // Store lowercase category keys

        transactions.forEach(t => {
            const amount = Number(t.amount);
            if (amount < 0 && !isNaN(amount)) {
                try {
                    // Use UTC date parsing to avoid timezone issues affecting month/year match
                    const [year, month, day] = t.date.split('-').map(Number);
                    const txDate = new Date(Date.UTC(year, month - 1, day));

                    if (txDate.getUTCFullYear() === currentYear && txDate.getUTCMonth() === currentMonth) {
                        const expenseAmount = Math.abs(amount);
                        total += expenseAmount;
                        const categoryKey = (t.category?.trim().toLowerCase() || 'uncategorized');
                        byCategory[categoryKey] = (byCategory[categoryKey] || 0) + expenseAmount;
                    }
                } catch (e) {
                     console.warn(`Could not parse date for transaction ${t.id}: ${t.date}`, e);
                }
            }
        });
        return { total, byCategory };
    };

    /** Aggregates expenses by category from a list of transactions */
    const calculateExpenseByCategory = (transactions) => {
        return transactions
            .filter(t => t.amount < 0 && !isNaN(t.amount))
            .reduce((acc, t) => {
                const category = t.category?.trim() || 'Uncategorized';
                const categoryKey = category.toLowerCase();
                const current = acc[categoryKey] || { label: category, amount: 0 };
                current.amount += Math.abs(t.amount);
                acc[categoryKey] = current;
                return acc;
            }, {});
    };

     /** Calculates total spending for the last N months */
     const calculateLastNMonthsSpending = (transactions, numMonths) => {
         const endDate = new Date();
         const startDate = new Date();
         startDate.setMonth(endDate.getMonth() - numMonths + 1);
         startDate.setDate(1); // Start from the beginning of the first month

         const monthlyTotals = {}; // Store YYYY-MM keys
         const monthLabels = []; // Store labels like 'Jan 24'

         // Initialize months
         let tempDate = new Date(startDate);
         for (let i = 0; i < numMonths; i++) {
             const year = tempDate.getUTCFullYear();
             const month = tempDate.getUTCMonth(); // 0-indexed
             const key = `${year}-${String(month + 1).padStart(2, '0')}`;
             monthlyTotals[key] = 0;
              // Format label (e.g., 'Jan 24')
             const label = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(tempDate);
             monthLabels.push(label);
             tempDate.setMonth(tempDate.getMonth() + 1);
         }

         // Aggregate spending
         transactions.forEach(t => {
             const amount = Number(t.amount);
             if (amount < 0 && !isNaN(amount)) { // Only expenses
                 try {
                     const [year, month, day] = t.date.split('-').map(Number);
                     const txDate = new Date(Date.UTC(year, month - 1, day));

                     if (txDate >= startDate && txDate <= endDate) {
                         const key = `${year}-${String(month).padStart(2, '0')}`;
                         if (monthlyTotals.hasOwnProperty(key)) {
                             monthlyTotals[key] += Math.abs(amount);
                         }
                     }
                 } catch (e) { /* ignore date parse errors */ }
             }
         });

         // Extract data in the correct order based on labels
         const data = monthLabels.map(label => {
             // Find the key corresponding to the label (this is a bit fragile, assumes labels match keys)
             let key = '';
             tempDate = new Date(startDate);
             for (let i = 0; i < numMonths; i++) {
                 const currentLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(tempDate);
                 if (currentLabel === label) {
                      key = `${tempDate.getUTCFullYear()}-${String(tempDate.getUTCMonth() + 1).padStart(2, '0')}`;
                      break;
                 }
                 tempDate.setMonth(tempDate.getMonth() + 1);
             }
             return monthlyTotals[key] || 0;
         });


         return { labels: monthLabels, data };
     };


    /** Filters and sorts transactions based on criteria */
    const filterAndSortTransactions = (transactions, filters, sort) => {
        // --- Filtering ---
        const filtered = transactions.filter(t => {
            let keep = true;
            if (filters.type === 'income') keep &&= t.amount >= 0;
            if (filters.type === 'expense') keep &&= t.amount < 0;
            if (filters.category !== 'all') keep &&= (t.category?.toLowerCase() === filters.category.toLowerCase());
            if (filters.dateStart) keep &&= t.date >= filters.dateStart;
            if (filters.dateEnd) keep &&= t.date <= filters.dateEnd;
            if (filters.searchTerm) {
                const term = filters.searchTerm.toLowerCase();
                keep &&= (t.description.toLowerCase().includes(term) || t.category?.toLowerCase().includes(term));
            }
            return keep;
        });

        // --- Sorting ---
        filtered.sort((a, b) => {
            let compareA, compareB;
            switch (sort.key) {
                case 'amount': compareA = a.amount; compareB = b.amount; break;
                case 'category': compareA = a.category?.toLowerCase() || ''; compareB = b.category?.toLowerCase() || ''; break;
                case 'date': default: compareA = new Date(a.date); compareB = new Date(b.date); break; // Compare as dates
            }

            let comparison = 0;
            if (compareA < compareB) comparison = -1;
            if (compareA > compareB) comparison = 1;

            const directionMultiplier = sort.direction === 'asc' ? 1 : -1;
            if (comparison !== 0) {
                return comparison * directionMultiplier;
            } else if (sort.key !== 'date') { // Secondary sort by date desc
                return new Date(b.date) - new Date(a.date);
            }
            return 0;
        });
        return filtered;
    };


    return {
        calculateSummary,
        calculateGoalProgress,
        calculateBudgetStatus,
        calculateMonthlyExpenses,
        calculateExpenseByCategory,
        calculateLastNMonthsSpending,
        filterAndSortTransactions,
    };
})();


// ====================================
// Main Application Controller
// ====================================

const AppController = (() => {
    const DOM = UIManager.selectors; // Alias

    // --- Navigation ---
    const handleNavigation = (event) => {
        const link = event.target.closest('.nav-link');
        if (!link || !link.dataset.section) return;

        event.preventDefault();
        const sectionId = link.dataset.section;
        navigateToSection(sectionId);

        // Close mobile sidebar on nav
        if (StateManager.getUiTransient().isMobile && DOM.body.classList.contains('sidebar-open')) {
            UIManager.setSidebarState(false); // Force close
        }
    };

    const navigateToSection = (sectionId, forceUpdate = false) => {
         if (!sectionId || typeof sectionId !== 'string') sectionId = 'dashboard';
        const currentSection = StateManager.getUiPreferences().activeSection;

        if (sectionId === currentSection && !forceUpdate) return;

        // Update URL hash for better history/linking (optional)
        // history.pushState(null, '', `#${sectionId}`); // Can cause issues if not handled carefully

        // Hide all sections
        DOM.sections.forEach(section => section.classList.remove('active-section'));

        // Show target section
        const targetSection = document.getElementById(`section-${sectionId}`);
        if (targetSection) {
            targetSection.classList.add('active-section');
            targetSection.scrollTop = 0;
            StateManager.updateUiPreferences({ activeSection: sectionId });

            // Update nav links active state
            DOM.sidebar.navLinks.forEach(link => {
                const isActive = link.dataset.section === sectionId;
                link.classList.toggle('active', isActive);
                link.setAttribute('aria-current', isActive ? 'page' : 'false');
            });

            // Update page title
            const sectionTitle = targetSection.querySelector('h1')?.textContent?.trim() || sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
            document.title = `FinTrack Pro - ${sectionTitle}`;

            // Trigger UI update for the new section
            UIManager.updateUI(sectionId);
            console.log(`Navigated to section: ${sectionId}`);
            StateManager.saveState(); // Save the new active section preference
        } else {
            console.error(`Section element not found: #section-${sectionId}. Falling back to dashboard.`);
            if (sectionId !== 'dashboard') navigateToSection('dashboard', true);
        }
    };

    // Handle URL hash changes (e.g., back/forward button or direct link)
     const handleHashChange = () => {
         const hash = window.location.hash.substring(1);
         const validSections = Array.from(DOM.sidebar.navLinks).map(link => link.dataset.section);
         if (hash && validSections.includes(hash)) {
             navigateToSection(hash);
         } else {
             // If hash is invalid or empty, navigate to default (dashboard) without pushing history
             navigateToSection(StateManager.getUiPreferences().activeSection || 'dashboard');
         }
     };


    // --- Sidebar Interactions ---
    const handleSidebarToggleClick = () => {
        if (!StateManager.getUiTransient().isMobile) {
            // Desktop: Toggle preference and save
            const shouldBeCollapsed = !StateManager.getUiPreferences().isSidebarCollapsed;
            StateManager.updateUiPreferences({ isSidebarCollapsed: shouldBeCollapsed });
            UIManager.setSidebarState(shouldBeCollapsed);
            StateManager.saveState(); // Save preference
        } else {
            // Mobile: Just toggle visually
            UIManager.setSidebarState();
        }
    };

    const handleOverlayClick = (event) => {
        if (StateManager.getUiTransient().isMobile &&
            DOM.body.classList.contains('sidebar-open') &&
            event.target === DOM.mainContent) {
                UIManager.setSidebarState(false); // Force close
        }
    };

    // --- Window Resize Handling ---
    const handleResize = () => {
        UIManager.setSidebarState(); // Update sidebar for new size
    };
    const debouncedResizeHandler = debounce(handleResize, 200);

    // --- Generic Button Loading State ---
    const toggleButtonLoading = (button, isLoading) => {
        if (!button) return;
        button.disabled = isLoading;
        button.classList.toggle('loading', isLoading);
    };

    // --- Transaction Handlers ---
    const handleAddTransaction = async (event) => {
        event.preventDefault();
        const form = event.target;
        const button = form.querySelector('button[type="submit"]');
        toggleButtonLoading(button, true);

        const description = DOM.finance.descriptionInput.value.trim();
        const amount = parseFloat(DOM.finance.amountInput.value);
        const category = DOM.finance.categoryInput.value.trim();
        const date = DOM.finance.dateInput.value;
        const isRecurringTemplate = DOM.finance.recurringCheckbox.checked;

        // More Robust Validation
        if (!description || isNaN(amount) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            UIManager.showToast('Please fill in description, a valid amount (e.g., -50 or 1500), and date.', 'warning');
            toggleButtonLoading(button, false); return;
        }
        if (amount === 0) {
             UIManager.showToast('Amount cannot be zero.', 'warning');
             toggleButtonLoading(button, false); return;
        }
         if (amount > 0 && category) {
             UIManager.showToast('Categories should only be assigned to expenses (negative amounts).', 'warning');
             // Optionally clear category input here, or just warn
             toggleButtonLoading(button, false); return;
         }


        const newTransaction = {
            id: generateId('tx'), description, amount, date,
            category: amount < 0 ? (category || 'Uncategorized') : '',
            timestamp: Date.now(),
        };

        try {
             StateManager.addTransaction(newTransaction);
             let message = 'Transaction added successfully!';

             // Add category globally if it's new (and expense)
             if (amount < 0 && category && StateManager.addCategory(category)) {
                 console.log(`New category added: ${category}`);
                 // No separate toast needed, category list will update
             }

             // Handle recurring template
             if (isRecurringTemplate) {
                  // Store only essential template info, not the full tx object
                 const template = { id: newTransaction.id, description, amount, category: newTransaction.category };
                 StateManager.addRecurringTemplate(template);
                 message = `Transaction added and saved as recurring template.`;
             }

             await StateManager.saveState();
             UIManager.updateUI('finance');
             UIManager.updateUI('dashboard');
             UIManager.updateUI('budgets');
             UIManager.showToast(message, 'success');
             form.reset();
             DOM.finance.dateInput.valueAsDate = new Date(); // Reset date to today
             DOM.finance.descriptionInput.focus();
        } catch (error) {
             console.error("Error adding transaction:", error);
             UIManager.showToast('Failed to add transaction.', 'error');
        } finally {
             toggleButtonLoading(button, false);
             DOM.finance.recurringCheckbox.checked = false; // Uncheck recurring box
        }
    };

   const handleEditTransaction = async (event) => {
       event.preventDefault(); // Prevent default dialog form submission if needed
       const form = event.target;
       const button = form.querySelector('button[type="submit"]'); // value="save"
       toggleButtonLoading(button, true);

       const id = DOM.finance.editDialog.id.value;
       const description = DOM.finance.editDialog.description.value.trim();
       const amount = parseFloat(DOM.finance.editDialog.amount.value);
       const category = DOM.finance.editDialog.category.value.trim();
       const date = DOM.finance.editDialog.date.value;

       if (!id || !description || isNaN(amount) || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
           UIManager.showToast('Invalid data. Check all fields.', 'error');
           toggleButtonLoading(button, false); return;
       }
       if (amount === 0) {
            UIManager.showToast('Amount cannot be zero.', 'warning');
            toggleButtonLoading(button, false); return;
       }
        if (amount > 0 && category) {
            UIManager.showToast('Categories are only for expenses (negative amounts).', 'warning');
            toggleButtonLoading(button, false); return;
        }

        const updatedTxData = {
            description, amount, date,
            category: amount < 0 ? (category || 'Uncategorized') : '',
            // timestamp is preserved by updateTransaction logic in StateManager
        };

        try {
             StateManager.updateTransaction({ id, ...updatedTxData }); // Pass ID separately
             // Add category if new
             if (amount < 0 && category) StateManager.addCategory(category);

             await StateManager.saveState();
             UIManager.closeDialog('edit-transaction-dialog'); // Close dialog explicitly
             UIManager.updateUI('finance');
             UIManager.updateUI('dashboard');
             UIManager.updateUI('budgets');
             UIManager.showToast('Transaction updated.', 'success');
        } catch (error) {
             console.error("Error updating transaction:", error);
             UIManager.showToast('Failed to update transaction.', 'error');
        } finally {
             toggleButtonLoading(button, false);
        }
   };

    const handleDeleteTransaction = async (id, buttonElement) => {
        if (!id) return;
        if (!await UIManager.showConfirm('Are you sure you want to delete this transaction permanently?')) return;

        toggleButtonLoading(buttonElement, true);
        try {
             StateManager.deleteTransaction(id);
             // Check if it was a recurring template source and remove template if desired
             const templateExists = StateManager.getSettings().recurringTemplates.some(t => t.id === id);
             if (templateExists) {
                 StateManager.removeRecurringTemplate(id);
                 console.log("Removed associated recurring template.");
                 // Optionally notify user template was also removed
             }

             await StateManager.saveState();
             UIManager.updateUI('finance');
             UIManager.updateUI('dashboard');
             UIManager.updateUI('budgets');
             UIManager.showToast('Transaction deleted.', 'info');
        } catch (error) {
             console.error("Error deleting transaction:", error);
             UIManager.showToast('Failed to delete transaction.', 'error');
        } finally {
             toggleButtonLoading(buttonElement, false);
        }
    };

    const openEditTransactionDialog = (id) => {
        const transaction = StateManager.getState().transactions.find(tx => tx.id === id);
        if (transaction) {
            UIManager.populateEditTransactionForm(transaction);
        } else {
             UIManager.showToast('Transaction data not found.', 'error');
        }
    };

    const handleRecurringTransactionAdd = async (templateId, buttonElement) => {
         const template = StateManager.getSettings().recurringTemplates.find(t => t.id === templateId);
         if (!template) {
             UIManager.showToast('Recurring template source not found.', 'error'); return;
         }

          const today = new Date().toISOString().slice(0, 10);
          if (!await UIManager.showConfirm(`Add a new transaction based on "${template.description}" for today (${formatDate(today)})?`)) return;

         toggleButtonLoading(buttonElement, true);
         try {
            const newTransaction = {
                description: template.description,
                amount: template.amount,
                category: template.category,
                date: today,
                id: generateId('tx'), // New unique ID
                timestamp: Date.now(),
            };

            StateManager.addTransaction(newTransaction);
            await StateManager.saveState();
            UIManager.updateUI('finance');
            UIManager.updateUI('dashboard');
            UIManager.updateUI('budgets');
            UIManager.showToast(`Added transaction from template.`, 'success');
         } catch (error) {
             console.error("Error adding recurring transaction:", error);
             UIManager.showToast('Failed to add transaction from template.', 'error');
         } finally {
             toggleButtonLoading(buttonElement, false);
         }
     };

    // --- Finance Filters/Sort Handlers ---
    const handleFinanceControlsChange = () => {
        const filters = {
            type: DOM.finance.filterType.value,
            category: DOM.finance.filterCategory.value,
            dateStart: DOM.finance.filterDateStart.value,
            dateEnd: DOM.finance.filterDateEnd.value,
            searchTerm: DOM.finance.searchTransactions.value.trim(),
        };
        const [sortKey, sortDir] = DOM.finance.sortTransactions.value.split('-');
        const sort = { key: sortKey || 'date', direction: sortDir || 'desc' };

        StateManager.updateUiTransient({ filters, sort });
        UIManager.updateUI('finance'); // Re-render list, chart, and filtered summary
    };
    const debouncedSearchHandler = debounce(handleFinanceControlsChange, 300);

    const handleResetFilters = () => {
        DOM.finance.filterType.value = 'all';
        DOM.finance.filterCategory.value = 'all';
        DOM.finance.filterDateStart.value = '';
        DOM.finance.filterDateEnd.value = '';
        DOM.finance.searchTransactions.value = '';
        DOM.finance.sortTransactions.value = 'date-desc';
        handleFinanceControlsChange(); // Trigger update
        UIManager.showToast('Filters and sort reset.', 'info');
    };

    // --- Budget Handlers ---
    const handleSetOverallBudget = async (event) => {
        event.preventDefault();
        const button = DOM.budgets.overallSaveBtn;
        toggleButtonLoading(button, true);
        const amountStr = DOM.budgets.overallAmountInput.value.trim();
        const amount = amountStr === '' ? null : parseFloat(amountStr);

        if (amount !== null && (isNaN(amount) || amount < 0)) {
             UIManager.showToast('Enter a valid positive amount, or leave blank to remove.', 'warning');
             toggleButtonLoading(button, false); return;
        }
        try {
            StateManager.setOverallBudget(amount);
            await StateManager.saveState();
            UIManager.updateUI('budgets');
            UIManager.updateUI('dashboard');
            UIManager.showToast(`Overall budget ${amount === null ? 'removed' : 'updated'}.`, 'success');
        } catch (error) {
             console.error("Error setting overall budget:", error);
             UIManager.showToast('Failed to update overall budget.', 'error');
        } finally { toggleButtonLoading(button, false); }
    };

    const handleSetCategoryBudget = async (event) => {
        event.preventDefault();
        const form = event.target;
        const button = DOM.budgets.categoryAddBtn;
        toggleButtonLoading(button, true);

        let category = DOM.budgets.categorySelect.value;
        const newCategoryName = DOM.budgets.newCategoryNameInput.value.trim();
        const amountStr = DOM.budgets.categoryAmountInput.value.trim();
        const amount = parseFloat(amountStr);

        if (newCategoryName) { // Prioritize new category input
            category = newCategoryName;
            // Add globally only if it's truly new
            if(StateManager.addCategory(category)) {
                 console.log(`New category added via budget form: ${category}`);
            }
        }

        if (!category) {
            UIManager.showToast('Please select or enter a category name.', 'warning');
            toggleButtonLoading(button, false); return;
        }
        if (isNaN(amount) || amount < 0) {
            UIManager.showToast('Please enter a valid positive budget amount.', 'warning');
            toggleButtonLoading(button, false); return;
        }

        try {
             StateManager.setCategoryBudget(category, amount);
             await StateManager.saveState();
             UIManager.updateUI('budgets'); // Refreshes lists and dropdowns via renderCategoryManagementList
             form.reset(); // Clear the form
             DOM.budgets.categorySelect.value = ''; // Ensure dropdown is reset
             UIManager.showToast(`Budget for "${category}" set/updated.`, 'success');
        } catch (error) {
             console.error("Error setting category budget:", error);
             UIManager.showToast(`Failed to set budget for "${category}".`, 'error');
        } finally { toggleButtonLoading(button, false); }
   };

    const handleDeleteCategoryBudget = async (category, buttonElement) => {
        if (!category) return;
         if (!await UIManager.showConfirm(`Remove the budget limit for "${category}"? (Spending tracking remains)`)) return;

        toggleButtonLoading(buttonElement, true);
        try {
             StateManager.deleteCategoryBudget(category);
             await StateManager.saveState();
             UIManager.updateUI('budgets');
             UIManager.showToast(`Budget for "${category}" removed.`, 'info');
        } catch (error) {
             console.error("Error deleting category budget:", error);
             UIManager.showToast(`Failed to remove budget for "${category}".`, 'error');
        } finally { toggleButtonLoading(buttonElement, false); }
    };

    // --- Goal Handlers ---
   const handleAddGoal = async (event) => {
       event.preventDefault();
       const form = event.target;
       const button = DOM.goals.addBtn;
       toggleButtonLoading(button, true);

       const description = DOM.goals.descriptionInput.value.trim();
       const target = parseFloat(DOM.goals.targetInput.value);

       if (!description || isNaN(target) || target <= 0) {
           UIManager.showToast('Enter a valid description and positive target amount.', 'warning');
           toggleButtonLoading(button, false); return;
       }
       const newGoal = {
           id: generateId('goal'), description, target,
           createdAt: new Date().toISOString().slice(0, 10),
       };
       try {
           StateManager.addGoal(newGoal);
           await StateManager.saveState();
           UIManager.updateUI('goals');
           UIManager.updateUI('dashboard');
           form.reset();
           UIManager.showToast('New savings goal added!', 'success');
       } catch (error) {
           console.error("Error adding goal:", error);
           UIManager.showToast('Failed to add goal.', 'error');
       } finally { toggleButtonLoading(button, false); }
   };

    const handleDeleteGoal = async (id, buttonElement) => {
        if (!id) return;
        if (!await UIManager.showConfirm('Are you sure you want to delete this savings goal?')) return;

       toggleButtonLoading(buttonElement, true);
       try {
            StateManager.deleteGoal(id);
           await StateManager.saveState();
           UIManager.updateUI('goals');
           UIManager.updateUI('dashboard');
           UIManager.showToast('Goal deleted.', 'info');
       } catch (error) {
            console.error("Error deleting goal:", error);
            UIManager.showToast('Failed to delete goal.', 'error');
       } finally { toggleButtonLoading(buttonElement, false); }
   };

    // --- Note Handlers ---
    const handleAddNote = async (event) => {
       event.preventDefault();
       const form = event.target;
       const button = DOM.notes.addBtn;
       toggleButtonLoading(button, true);

       const text = DOM.notes.textInput.value.trim();
       if (!text) {
           UIManager.showToast('Note cannot be empty.', 'warning');
           toggleButtonLoading(button, false); return;
       }
       const newNote = { id: generateId('note'), text, timestamp: Date.now() };
       try {
           StateManager.addNote(newNote);
           await StateManager.saveState();
           UIManager.updateUI('notes');
           form.reset();
            UIManager.updateNoteCharCount(); // Reset char count display
           UIManager.showToast('Note added.', 'success');
       } catch (error) {
           console.error("Error adding note:", error);
           UIManager.showToast('Failed to add note.', 'error');
       } finally { toggleButtonLoading(button, false); }
   };

    const handleDeleteNote = async (id, buttonElement) => {
        if (!id) return;
        if (!await UIManager.showConfirm('Are you sure you want to delete this note?')) return;

       toggleButtonLoading(buttonElement, true);
       try {
            StateManager.deleteNote(id);
           await StateManager.saveState();
           UIManager.updateUI('notes');
           UIManager.showToast('Note deleted.', 'info');
       } catch (error) {
            console.error("Error deleting note:", error);
            UIManager.showToast('Failed to delete note.', 'error');
       } finally { toggleButtonLoading(buttonElement, false); }
   };

    const handleSearchNotes = () => {
        StateManager.updateUiTransient({ notesSearchTerm: DOM.notes.searchInput.value });
        UIManager.updateUI('notes');
    };
    const debouncedNotesSearch = debounce(handleSearchNotes, 300);

    // --- Settings Handlers ---
    const handleToggleTheme = () => {
       const currentTheme = StateManager.getSettings().theme;
       const newTheme = currentTheme === 'light' ? 'dark' : 'light';
       StateManager.updateSettings({ theme: newTheme });
       UIManager.applyTheme(newTheme);
       StateManager.saveState(); // Save preference
   };

    const handleChangeCurrency = () => {
        const selectedSymbol = DOM.settings.currencySelect.value;
        const currencyMap = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
        const selectedCode = currencyMap[selectedSymbol] || 'INR';

        StateManager.updateSettings({ currency: { symbol: selectedSymbol, code: selectedCode } });
        UIManager.updateCurrencyDisplay(); // Update formatting everywhere
        StateManager.saveState();
        UIManager.showToast(`Currency updated to ${selectedCode} (${selectedSymbol})`, 'info');
    };

    const handleAddCustomCategory = async () => {
        const button = DOM.settings.addCategoryBtn;
        const input = DOM.settings.newCategoryInput;
        toggleButtonLoading(button, true);
        const newCategory = input.value.trim();

        if (!newCategory) {
             UIManager.showToast('Enter a category name.', 'warning');
             toggleButtonLoading(button, false); return;
        }
        if (StateManager.getSettings().categories.some(c => c.toLowerCase() === newCategory.toLowerCase())) {
             UIManager.showToast(`Category "${newCategory}" already exists.`, 'warning');
             toggleButtonLoading(button, false); return;
        }
        try {
            StateManager.addCategory(newCategory);
            await StateManager.saveState();
            UIManager.renderCategoryManagementList(StateManager.getSettings().categories); // Update UI immediately
            input.value = '';
            UIManager.showToast(`Category "${newCategory}" added.`, 'success');
            // Update other sections implicitly on next navigation or via a broader UIManager.updateUI call if needed
        } catch (error) {
            console.error("Error adding category:", error);
            UIManager.showToast('Failed to add category.', 'error');
        } finally { toggleButtonLoading(button, false); }
    };

    const handleDeleteCategory = async (category, buttonElement) => {
        if (!category) return;
        if (!await UIManager.showConfirm(`Delete category "${category}"? Existing transactions remain unchanged.`)) return;

        toggleButtonLoading(buttonElement, true);
        try {
            if (StateManager.deleteCategory(category)) { // Only proceed if deletion happened
                 await StateManager.saveState();
                 UIManager.renderCategoryManagementList(StateManager.getSettings().categories); // Update settings list
                 // Trigger updates in other sections needing category info
                 UIManager.updateUI('finance');
                 UIManager.updateUI('budgets');
                 UIManager.showToast(`Category "${category}" deleted.`, 'info');
            } else {
                 UIManager.showToast(`Category "${category}" not found.`, 'warning');
            }
        } catch (error) {
            console.error("Error deleting category:", error);
            UIManager.showToast('Failed to delete category.', 'error');
        } finally { toggleButtonLoading(buttonElement, false); }
    };

    const handleBackupData = () => { StateManager.backupData(); }; // Simple passthrough
    const handleRestoreDataClick = () => { DOM.settings.restoreInput?.click(); };
    const handleRestoreFileSelected = async (event) => {
        const file = event.target.files[0];
        const button = DOM.settings.restoreBtn;
        if (!file) return;
        toggleButtonLoading(button, true);
        try { await StateManager.restoreData(file); }
        catch (error) { /* Error handled within restoreData */ }
        finally { event.target.value = ''; toggleButtonLoading(button, false); }
    };
    const handleClearAllData = async () => {
        const button = DOM.settings.clearBtn;
        toggleButtonLoading(button, true);
        try { await StateManager.clearAllData(); }
        catch (error) { /* Error handled within clearAllData */ }
        finally { toggleButtonLoading(button, false); }
    };

    // --- Global Event Listener for Delegated Actions ---
    const handleMainContentClick = (event) => {
        const target = event.target;
        const closest = (selector) => target.closest(selector);

        // Transaction Actions
        const editTxBtn = closest('.edit-btn[data-id]');
        if (editTxBtn) { openEditTransactionDialog(editTxBtn.dataset.id); return; }
        const deleteTxBtn = closest('.delete-btn[data-id]');
        if (deleteTxBtn && closest('.transaction-item')) { handleDeleteTransaction(deleteTxBtn.dataset.id, deleteTxBtn); return; }
        const recurringBtn = closest('.recurring-btn[data-template-id]');
         if (recurringBtn) { handleRecurringTransactionAdd(recurringBtn.dataset.templateId, recurringBtn); return; }

        // Goal Delete
        const deleteGoalBtn = closest('.delete-goal-btn[data-id]');
        if (deleteGoalBtn) { handleDeleteGoal(deleteGoalBtn.dataset.id, deleteGoalBtn); return; }

        // Note Delete
        const deleteNoteBtn = closest('.delete-note-btn[data-id]');
        if (deleteNoteBtn) { handleDeleteNote(deleteNoteBtn.dataset.id, deleteNoteBtn); return; }

        // Budget Delete
        const deleteCatBudgetBtn = closest('.delete-category-budget-btn[data-category]');
        if (deleteCatBudgetBtn) { handleDeleteCategoryBudget(deleteCatBudgetBtn.dataset.category, deleteCatBudgetBtn); return; }

         // Category Delete (Settings)
         const deleteCatBtn = closest('.delete-category-btn[data-category]');
         if (deleteCatBtn && closest('.category-manage-item')) { handleDeleteCategory(deleteCatBtn.dataset.category, deleteCatBtn); return; }

        // Link to Section
        const sectionLink = closest('.link-to-section[data-section-target]');
        if (sectionLink) { event.preventDefault(); navigateToSection(sectionLink.dataset.sectionTarget); return; }
    };

    // --- Setup Event Listeners ---
    const setupEventListeners = () => {
        // Navigation & Sidebar
        DOM.sidebar.nav?.addEventListener('click', handleNavigation);
        DOM.sidebar.toggleBtn?.addEventListener('click', handleSidebarToggleClick);
        DOM.mainContent?.addEventListener('click', handleOverlayClick);

        // Global Delegated Clicks
        DOM.mainContent?.addEventListener('click', handleMainContentClick);

        // Forms
        DOM.finance.transactionForm?.addEventListener('submit', handleAddTransaction);
        DOM.finance.editDialog.form?.addEventListener('submit', handleEditTransaction); // Listen on form, not button
        DOM.budgets.overallForm?.addEventListener('submit', handleSetOverallBudget);
        DOM.budgets.categoryForm?.addEventListener('submit', handleSetCategoryBudget);
        DOM.goals.form?.addEventListener('submit', handleAddGoal);
        DOM.notes.form?.addEventListener('submit', handleAddNote);

        // Finance Filters
        [DOM.finance.filterType, DOM.finance.filterCategory, DOM.finance.filterDateStart, DOM.finance.filterDateEnd, DOM.finance.sortTransactions]
            .forEach(el => el?.addEventListener('change', handleFinanceControlsChange));
        DOM.finance.searchTransactions?.addEventListener('input', debouncedSearchHandler);
        DOM.finance.resetFiltersBtn?.addEventListener('click', handleResetFilters);

        // Notes Search & Char Count
        DOM.notes.searchInput?.addEventListener('input', debouncedNotesSearch);
        DOM.notes.textInput?.addEventListener('input', UIManager.updateNoteCharCount);

        // Settings Controls
        DOM.settings.themeToggleBtn?.addEventListener('click', handleToggleTheme);
        DOM.settings.currencySelect?.addEventListener('change', handleChangeCurrency);
        DOM.settings.addCategoryBtn?.addEventListener('click', handleAddCustomCategory);
        DOM.settings.newCategoryInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomCategory(); } });
        DOM.settings.backupBtn?.addEventListener('click', handleBackupData);
        DOM.settings.restoreBtn?.addEventListener('click', handleRestoreDataClick);
        DOM.settings.restoreInput?.addEventListener('change', handleRestoreFileSelected);
        DOM.settings.clearBtn?.addEventListener('click', handleClearAllData);

        // Window Resize & Hash Change
        window.addEventListener('resize', debouncedResizeHandler);
        window.addEventListener('hashchange', handleHashChange); // Handle back/forward nav
    };

    // --- Initialization Sequence ---
    const init = async () => {
        console.log('Initializing FinTrack Pro v3.1...');
        await StateManager.loadState();
        UIManager.init(); // DOM setup, initial sidebar
        UIManager.applyTheme(StateManager.getSettings().theme);
        UIManager.updateCurrencyDisplay(); // Includes initial summary render
        setupEventListeners();

        // Initial navigation based on hash or saved state
         const initialHash = window.location.hash.substring(1);
         const validSections = Array.from(DOM.sidebar.navLinks).map(link => link.dataset.section);
         const sectionToLoad = (initialHash && validSections.includes(initialHash))
            ? initialHash
            : StateManager.getUiPreferences().activeSection || 'dashboard';

        navigateToSection(sectionToLoad, true); // Force initial render
        UIManager.updateNoteCharCount(); // Initial char count

        console.log('FinTrack Pro Initialized and Ready.');
    };

    // Publicly Exposed Methods
    return { init, navigateToSection };
})();

// ====================================
// Application Start
// ====================================
document.addEventListener('DOMContentLoaded', AppController.init);
