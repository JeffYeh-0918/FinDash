// FinDash 功能模組：提示條、確認／輸入視窗、復原
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（主程式與其他模組的成員）。

const { ref, nextTick } = Vue;

export const useUi = (ctx) => {
    const { syncFromCloud, fetchStockPrices, expenses, stockTrades, selectedExpenseIds, selectedStockIds, pushToCloud, renderCharts } = ctx;

    // ---------- 統一的提示條、確認視窗、輸入視窗（取代瀏覽器內建的 alert / confirm / prompt） ----------
    const toasts = ref([]);
    let toastSeq = 0;
    const dismissToast = (id) => { toasts.value = toasts.value.filter(t => t.id !== id); };
    const showToast = (text, type = 'success', opts = {}) => {
        const id = ++toastSeq;
        toasts.value.push({ id, text, type, action: opts.action || null, actionLabel: opts.actionLabel || '' });
        if (toasts.value.length > 3) toasts.value.shift();
        setTimeout(() => dismissToast(id), opts.ms !== undefined ? opts.ms : (type === 'error' ? 9000 : 3500));
    };
    const runToastAction = (t) => { dismissToast(t.id); if (t.action) t.action(); };
    const toastClass = (type) => ({
        success: 'border-emerald-500/40 text-emerald-200',
        error: 'border-rose-500/40 text-rose-200',
        info: 'border-sky-500/40 text-sky-200'
    }[type] || 'border-slate-600 text-slate-200');
    const dialog = ref(null);
    const askConfirm = (o) => new Promise(resolve => {
        dialog.value = { kind: 'confirm', title: o.title || '請確認', message: o.message || '', confirmText: o.confirmText || '確定', cancelText: o.cancelText || '取消', danger: !!o.danger, hideCancel: !!o.hideCancel, resolve };
    });
    const askInput = (o) => new Promise(resolve => {
        dialog.value = { kind: 'input', title: o.title || '', label: o.label || '', value: o.value || '', confirmText: o.confirmText || '確定', cancelText: '取消', danger: false, hideCancel: false, resolve };
    });
    const closeDialog = (result) => { const d = dialog.value; dialog.value = null; if (d) d.resolve(result); };
    const submitDialog = () => { const d = dialog.value; if (!d) return; closeDialog(d.kind === 'confirm' ? true : ((d.value || '').trim() || null)); };
    const cancelDialog = () => { const d = dialog.value; if (!d) return; closeDialog(d.kind === 'confirm' ? false : null); };
    // 同步／報價失敗提示（背景自動同步時，每分鐘最多提示一次，避免洗版）
    let lastSyncFailToast = 0, lastPriceFailToast = 0;
    const notifySyncFailure = (silent) => {
        const now = Date.now();
        if (silent && now - lastSyncFailToast < 60000) return;
        lastSyncFailToast = now;
        showToast('同步失敗：請確認網路與 API 網址。你的變更仍保留在這台裝置。', 'error', { action: () => syncFromCloud(), actionLabel: '重試' });
    };
    const notifyPriceFailure = (missing, silent) => {
        const now = Date.now();
        if (silent && now - lastPriceFailToast < 120000) return;
        lastPriceFailToast = now;
        showToast(`${missing.length} 檔（${missing.join('、')}）無法取得最新報價，已保留舊價並標示。`, 'error', { action: () => fetchStockPrices(), actionLabel: '重試' });
    };
    // ---------- 復原 ----------
    let undoSnap = null, undoTimer = null;
    const undoToast = ref(null);
    const captureUndo = () => { undoSnap = { e: JSON.stringify(expenses.value), s: JSON.stringify(stockTrades.value) }; };
    const armUndo = (msg) => {
        if (!undoSnap) return;
        undoToast.value = msg;
        clearTimeout(undoTimer);
        undoTimer = setTimeout(() => { undoToast.value = null; undoSnap = null; }, 10000);
    };
    const clearUndo = () => { clearTimeout(undoTimer); undoToast.value = null; undoSnap = null; };
    const withUndo = (msg, fn) => { captureUndo(); fn(); armUndo(msg); };
    const undoLast = () => {
        if (!undoSnap) return;
        const snap = undoSnap;
        clearUndo();
        expenses.value = JSON.parse(snap.e);
        stockTrades.value = JSON.parse(snap.s);
        selectedExpenseIds.value = [];
        selectedStockIds.value = [];
        pushToCloud();
        nextTick(() => renderCharts());
    };

    return { toasts, dismissToast, showToast, runToastAction, toastClass, dialog, askConfirm, askInput, submitDialog, cancelDialog, notifySyncFailure, notifyPriceFailure, undoToast, captureUndo, armUndo, clearUndo, withUndo, undoLast };
};
