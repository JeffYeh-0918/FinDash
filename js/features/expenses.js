// FinDash 功能模組：日常收支：篩選、分頁、勾選合計、拖曳排序、新增／編輯／刪除、批次操作
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。
import { reorderWithGroup } from '../logic/reorder.js';
import { dropHiddenSelection } from '../logic/selection.js';

const { ref, nextTick, computed, watch } = Vue;

export const useExpenses = (ctx) => {
    // 取用前面模組已建立的成員
    const {
        draggedIndex, selectedExpenseIds, selectedStockIds, expenses, stockTrades, pushToCloud,
        renderCharts, visibleCount, PAGE_SIZE, expenseSearch, selectedCategoryFilters, selectedItemFilters,
        selectedPaymentFilters, selectedTypeFilters, selectedYear, selectedMonth, expenseMonthFilterScope, filterYears,
        filterMonths, targetCopyDate, todayStr, showBatchCopyModal, showToast, captureUndo,
        armUndo, editingExpenseId, expenseForm, appSettings, categoriesList, allowedItems,
        itemsList, paymentMethodsList, expenseSnap, showExpenseModal, withUndo, askConfirm,
        batchDateType, showBatchDateModal, targetBatchDate
    } = ctx;

    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找
    const filteredStockTrades = { get value() { return ctx.filteredStockTrades.value; }, set value(v) { ctx.filteredStockTrades.value = v; } };

    // （REORDER 區塊已移到 js/logic/，見檔頭 import）
    const draggingIds = ref([]);
    const onDragStart = (e, index, type) => {
        draggedIndex.value = index;
        const list = type === 'expense' ? filteredExpenses.value : filteredStockTrades.value;
        const sel = (type === 'expense' ? selectedExpenseIds.value : selectedStockIds.value).map(String);
        const dragged = list[index];
        draggingIds.value = !dragged ? [] : (sel.includes(String(dragged.id)) ? list.filter(x => sel.includes(String(x.id))).map(x => String(x.id)) : [String(dragged.id)]);
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(draggingIds.value.length)); } catch (err) {}
    };
    const onDragEnd = () => { draggingIds.value = []; };
    const onDragOver = (e, index) => {};
    const onDrop = (e, targetIndex, type) => {
        if (draggedIndex.value === null) return;
        if (type === 'expense') {
            expenses.value = reorderWithGroup(expenses.value, filteredExpenses.value, draggedIndex.value, targetIndex, selectedExpenseIds.value);
        } else if (type === 'stock') {
            stockTrades.value = reorderWithGroup(stockTrades.value, filteredStockTrades.value, draggedIndex.value, targetIndex, selectedStockIds.value);
        }
        draggedIndex.value = null;
        draggingIds.value = [];
        pushToCloud();
        nextTick(() => renderCharts());
    };
    // ---------- 勾選紀錄的合計 ----------
    const selectedExpenseStats = computed(() => {
        const ids = new Set(selectedExpenseIds.value.map(String));
        const r = { n: 0, exp: 0, inc: 0, paidExp: 0, paidInc: 0, hidden: 0 };
        const visible = new Set(filteredExpenses.value.map(e => String(e.id)));
        expenses.value.forEach(e => {
            if (!ids.has(String(e.id))) return;
            r.n++;
            if (!visible.has(String(e.id))) r.hidden++;
            const amt = Number(e.amount || 0), paid = Number(e.paidAmount || 0);
            if (e.type === '收入') { r.inc += amt; r.paidInc += paid; } else { r.exp += amt; r.paidExp += paid; }
        });
        return r;
    });
    const loadMoreExpenses = () => { visibleCount.value += PAGE_SIZE; };
    const onExpenseScroll = (ev) => {
        const el = ev.target;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && visibleCount.value < filteredExpenses.value.length) loadMoreExpenses();
    };
    watch([expenseSearch, selectedCategoryFilters, selectedItemFilters, selectedPaymentFilters, selectedTypeFilters, selectedYear, selectedMonth, expenseMonthFilterScope, filterYears, filterMonths], () => { visibleCount.value = PAGE_SIZE; }, { deep: true });
    const dateFilterActive = computed(() => filterYears.value.length > 0 || filterMonths.value.length > 0);
    const yearsOf = (list) => Array.from(new Set(list.map(x => String(x.date || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)))).sort().reverse();
    const expenseYearOptions = computed(() => yearsOf(expenses.value));
    const filteredExpenses = computed(() => {
        const prefix = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`;
        const kw = (expenseSearch.value || '').trim().toLowerCase();
        return expenses.value.filter(e => {
            const matchMonth = dateFilterActive.value
                ? ((filterYears.value.length === 0 || filterYears.value.includes(String(e.date || '').slice(0, 4))) && (filterMonths.value.length === 0 || filterMonths.value.includes(String(parseInt(String(e.date || '').slice(5, 7), 10)))))
                : (expenseMonthFilterScope.value === 'ALL' || (e.date && e.date.startsWith(prefix)));
            const matchKw = !kw || 
                (e.item && String(e.item).toLowerCase().includes(kw)) ||
                (e.category && String(e.category).toLowerCase().includes(kw)) ||
                (e.content && String(e.content).toLowerCase().includes(kw)) ||
                (e.note && String(e.note).toLowerCase().includes(kw));
            const matchCat = selectedCategoryFilters.value.length === 0 || selectedCategoryFilters.value.includes(e.category);
            const matchItem = selectedItemFilters.value.length === 0 || selectedItemFilters.value.includes(e.item);
            const matchPay = selectedPaymentFilters.value.length === 0 || selectedPaymentFilters.value.includes(e.paymentMethod);
            const matchType = selectedTypeFilters.value.length === 0 || selectedTypeFilters.value.includes(e.type);
            return matchMonth && matchKw && matchCat && matchItem && matchPay && matchType;
        });
    });
    const displayedExpenses = computed(() => filteredExpenses.value.slice(0, visibleCount.value));
    const expenseFilterActive = computed(() => !!((expenseSearch.value || '').trim() || selectedCategoryFilters.value.length || selectedItemFilters.value.length
        || selectedPaymentFilters.value.length || selectedTypeFilters.value.length || filterYears.value.length || filterMonths.value.length));
    const resetFilters = () => {
        selectedExpenseIds.value = [];
        expenseSearch.value = '';
        selectedCategoryFilters.value = [];
        selectedItemFilters.value = [];
        selectedPaymentFilters.value = [];
        selectedTypeFilters.value = [];
        filterYears.value = [];
        filterMonths.value = [];
    };
    watch(filteredExpenses, (list) => dropHiddenSelection(selectedExpenseIds, list));
    const monthSelectOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} 月` }));
    const typeSelectOptions = [{ value: '支出', label: '支出 (-)' }, { value: '收入', label: '收入 (+)' }];
    const expenseYearSelectOptions = computed(() => expenseYearOptions.value.map(y => ({ value: y, label: `${y} 年` })));
    const isAllExpensesSelected = computed(() => filteredExpenses.value.length > 0 && selectedExpenseIds.value.length === filteredExpenses.value.length);
    const toggleSelectAllExpenses = (e) => { selectedExpenseIds.value = e.target.checked ? filteredExpenses.value.map(x => x.id) : []; };
    // 執行批次複製功能
    const openBatchCopyModal = () => {
        if (selectedExpenseIds.value.length === 0) return;
        targetCopyDate.value = todayStr();
        showBatchCopyModal.value = true;
    };
    const applyBatchCopy = () => {
        if (!targetCopyDate.value) {
            showToast('請選擇目標複製日期', 'error');
            return;
        }
        captureUndo();
        const targetItems = expenses.value.filter(e => selectedExpenseIds.value.includes(e.id));
        const usedIds = new Set(expenses.value.map(e => e.id));
        const newItems = targetItems.map(item => {
            let newId;
            do { newId = Date.now() + Math.floor(Math.random() * 10000); } while (usedIds.has(newId));
            usedIds.add(newId);
            return newId;
        }).map((newId, i) => ({
            ...targetItems[i],
            id: newId,
            date: targetCopyDate.value,
            paymentDate: '',
            settlementDate: '',
            stockId: ''
        }));
        
        expenses.value.unshift(...newItems);
        showBatchCopyModal.value = false;
        selectedExpenseIds.value = [];
        pushToCloud();
        armUndo(`已複製 ${newItems.length} 筆資料至 ${targetCopyDate.value}`);
        nextTick(() => renderCharts());
    };
    const openExpenseModal = (item = null) => {
        if (item) {
            editingExpenseId.value = item.id;
            expenseForm.value = { ...item };
        } else {
            editingExpenseId.value = null;
            expenseForm.value = { type: '支出', date: todayStr(), category: Object.keys(appSettings.value.categoryItems)[0] || categoriesList.value[0], item: (allowedItems(Object.keys(appSettings.value.categoryItems)[0])[0]) || itemsList.value[0], content: '', amount: null, paidAmount: null, note: '', paymentMethod: paymentMethodsList.value[0], paymentDate: '', settlementDate: '' };
        }
        expenseSnap.value = JSON.stringify(expenseForm.value);
        showExpenseModal.value = true;
    };
    const saveExpenseSubmit = () => {
        const data = { ...expenseForm.value, amount: Number(expenseForm.value.amount || 0), paidAmount: Number(expenseForm.value.paidAmount || 0) };
        if (editingExpenseId.value) {
            const idx = expenses.value.findIndex(e => e.id === editingExpenseId.value);
            if (idx !== -1) expenses.value[idx] = { id: editingExpenseId.value, ...data };
        } else {
            expenses.value.unshift({ id: Date.now(), ...data });
        }
        showExpenseModal.value = false;
        pushToCloud();
        nextTick(() => renderCharts());
    };
    const confirmDeleteExpense = (item) => {
        {   // 單筆刪除不再詢問，改以「復原」提示補救
            withUndo('已刪除 1 筆收支紀錄', () => { expenses.value = expenses.value.filter(e => e.id !== item.id); });
            pushToCloud();
            nextTick(() => renderCharts());
        }
    };
    const confirmBatchDeleteExpenses = async () => {
        if (await askConfirm({ title: '批次刪除', message: `確定要刪除勾選的 ${selectedExpenseIds.value.length} 筆收支紀錄？\n刪除後 10 秒內可以復原。`, confirmText: '刪除', danger: true })) {
            withUndo(`已刪除 ${selectedExpenseIds.value.length} 筆收支紀錄`, () => { expenses.value = expenses.value.filter(e => !selectedExpenseIds.value.includes(e.id)); });
            selectedExpenseIds.value = [];
            pushToCloud();
            nextTick(() => renderCharts());
        }
    };
    const newExpenseId = (extraTaken = []) => {
        let nid = Date.now() + 1;
        while (expenses.value.some(e => e.id === nid) || extraTaken.includes(nid)) nid++;
        return nid;
    };
    const openBatchDateModal = (type) => {
        batchDateType.value = type;
        showBatchDateModal.value = true;
    };
    const applyBatchDate = () => {
        captureUndo();
        const undoN = selectedExpenseIds.value.length;
        expenses.value.forEach(e => {
            if (selectedExpenseIds.value.includes(e.id)) {
                if (batchDateType.value === 'payment') e.paymentDate = targetBatchDate.value;
                else e.settlementDate = targetBatchDate.value;
            }
        });
        showBatchDateModal.value = false;
        selectedExpenseIds.value = [];
        pushToCloud();
        armUndo(`已更新 ${undoN} 筆的${batchDateType.value === 'payment' ? '付款日' : '結算日'}`);
    };
    const changeMonth = (delta) => {
        let m = selectedMonth.value + delta;
        let y = selectedYear.value;
        if (m > 12) { m = 1; y += 1; }
        else if (m < 1) { m = 12; y -= 1; }
        selectedYear.value = y;
        selectedMonth.value = m;
        nextTick(() => renderCharts());
    };

    return {
        draggingIds, onDragStart, onDragEnd, onDragOver, onDrop, selectedExpenseStats,
        loadMoreExpenses, onExpenseScroll, dateFilterActive, yearsOf, expenseYearOptions, filteredExpenses,
        displayedExpenses, expenseFilterActive, resetFilters, monthSelectOptions, typeSelectOptions, expenseYearSelectOptions,
        isAllExpensesSelected, toggleSelectAllExpenses, openBatchCopyModal, applyBatchCopy, openExpenseModal, saveExpenseSubmit,
        confirmDeleteExpense, confirmBatchDeleteExpenses, newExpenseId, openBatchDateModal, applyBatchDate, changeMonth
    };
};
