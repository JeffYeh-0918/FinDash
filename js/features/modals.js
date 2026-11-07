// FinDash 功能模組：彈窗規則（Esc、點背景、焦點管理、未儲存內容詢問）
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。

export const useModals = (ctx) => {
    // 取用前面模組已建立的成員
    const {
        showApiConfigModal, inputApiUrl, gasApiUrl, showExpenseModal, expenseForm, expenseSnap,
        showStockModal, stockForm, stockSnap, showBatchDateModal, showBatchCopyModal, showCardSettingsModal,
        showRealizedModal, showImportHelpModal, askConfirm, dialog, cancelDialog, closeAllDropdowns
    } = ctx;

    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找
    const showImportPreviewModal = { get value() { return ctx.showImportPreviewModal.value; }, set value(v) { ctx.showImportPreviewModal.value = v; } };
    const importPreview = { get value() { return ctx.importPreview.value; }, set value(v) { ctx.importPreview.value = v; } };
    const showCategoryMapModal = { get value() { return ctx.showCategoryMapModal.value; }, set value(v) { ctx.showCategoryMapModal.value = v; } };
    const itemDetail = { get value() { return ctx.itemDetail.value; }, set value(v) { ctx.itemDetail.value = v; } };
    const cardDetail = { get value() { return ctx.cardDetail.value; }, set value(v) { ctx.cardDetail.value = v; } };
    const showResetModal = { get value() { return ctx.showResetModal.value; }, set value(v) { ctx.showResetModal.value = v; } };

    const modalRegistry = {
        showApiConfigModal: { type: 'form', close: () => { showApiConfigModal.value = false; inputApiUrl.value = gasApiUrl.value; }, dirty: () => (inputApiUrl.value || '').trim() !== (gasApiUrl.value || '') },
        showExpenseModal: { type: 'form', close: () => { showExpenseModal.value = false; }, dirty: () => JSON.stringify(expenseForm.value) !== expenseSnap.value },
        showStockModal: { type: 'form', close: () => { showStockModal.value = false; }, dirty: () => JSON.stringify(stockForm.value) !== stockSnap.value },
        showBatchDateModal: { type: 'form', close: () => { showBatchDateModal.value = false; } },
        showBatchCopyModal: { type: 'form', close: () => { showBatchCopyModal.value = false; } },
        showImportPreviewModal: { type: 'form', close: () => { showImportPreviewModal.value = false; importPreview.value = null; } },
        showCategoryMapModal: { type: 'setting', close: () => { showCategoryMapModal.value = false; } },
        showCardSettingsModal: { type: 'setting', close: () => { showCardSettingsModal.value = false; } },
        itemDetail: { type: 'info', close: () => { itemDetail.value = null; } },
        cardDetail: { type: 'info', close: () => { cardDetail.value = null; } },
        showRealizedModal: { type: 'info', close: () => { showRealizedModal.value = false; } },
        showImportHelpModal: { type: 'info', close: () => { showImportHelpModal.value = false; } },
        showResetModal: { type: 'danger', close: () => { showResetModal.value = false; } }
    };
    const requestClose = async (name) => {
        const m = modalRegistry[name];
        if (!m) return;
        if (m.dirty && m.dirty()) {
            const ok = await askConfirm({ title: '放棄尚未儲存的內容？', message: '關閉後，剛剛填寫的內容會消失。', confirmText: '放棄並關閉', cancelText: '繼續編輯', danger: true });
            if (!ok) return;
        }
        m.close();
    };
    const onBackdrop = (name) => { const m = modalRegistry[name]; if (m && (m.type === 'info' || m.type === 'setting')) requestClose(name); };
    const topModalEl = () => {
        let best = null, bz = -1;
        document.querySelectorAll('[data-modal],[data-dialog]').forEach(el => { const z = parseInt(getComputedStyle(el).zIndex, 10) || 0; if (z >= bz) { best = el; bz = z; } });
        return best;
    };
    const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const handleGlobalKeydown = (ev) => {
        if (ev.key === 'Escape') {
            const top = topModalEl();
            if (dialog.value) { ev.preventDefault(); cancelDialog(); return; }
            if (top && top.dataset.modal) { ev.preventDefault(); requestClose(top.dataset.modal); return; }
            closeAllDropdowns();
        } else if (ev.key === 'Tab') {
            const top = topModalEl();
            if (!top) return;
            const f = Array.from(top.querySelectorAll(FOCUSABLE)).filter(n => n.offsetParent !== null);
            if (!f.length) { ev.preventDefault(); top.focus(); return; }
            const first = f[0], last = f[f.length - 1], cur = document.activeElement;
            if (ev.shiftKey && (cur === first || cur === top)) { ev.preventDefault(); last.focus(); }
            else if (!ev.shiftKey && cur === last) { ev.preventDefault(); first.focus(); }
        }
    };
    // 彈窗開啟時：補上對話框標記、把焦點移進去；關閉後把焦點還給原本的按鈕
    let currentModalEl = null, lastFocusEl = null;
    const enhanceModals = () => {
        document.querySelectorAll('[data-modal],[data-dialog]').forEach(el => {
            if (el.hasAttribute('role')) return;
            el.setAttribute('role', el.hasAttribute('data-dialog') ? 'alertdialog' : 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.tabIndex = -1;
            const h = el.querySelector('h3');
            if (h) { if (!h.id) h.id = 'dlg-' + Math.random().toString(36).slice(2, 8); el.setAttribute('aria-labelledby', h.id); }
        });
        const top = topModalEl();
        if (top && top !== currentModalEl) {
            if (!currentModalEl) lastFocusEl = document.activeElement;
            currentModalEl = top;
            const target = top.querySelector('[data-autofocus]') || top.querySelector('input:not([type=hidden]):not([disabled]):not([type=checkbox]),select,textarea') || top;
            try { target.focus({ preventScroll: true }); } catch (e) {}
        } else if (!top && currentModalEl) {
            currentModalEl = null;
            if (lastFocusEl && document.contains(lastFocusEl)) { try { lastFocusEl.focus({ preventScroll: true }); } catch (e) {} }
            lastFocusEl = null;
        }
    };

    return {
        requestClose, onBackdrop, handleGlobalKeydown, enhanceModals
    };
};
