// FinDash 功能模組：雲端同步接線（狀態徽章、API 設定、清空重來）
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。
import { createApi } from '../data/api.js';
import { createSyncEngine } from '../data/sync.js';
import { withDefaultSettings } from '../logic/ledger.js';

const { nextTick, ref, computed, watch } = Vue;

export const useSyncUi = (ctx) => {
    // 取用前面模組已建立的成員
    const {
        gasApiUrl, expenses, appSettings, stockTrades, isSyncing, askConfirm,
        blacklistedOptions, clearUndo, refreshDynamicOptions, notifySyncFailure, showToast, showApiConfigModal,
        STORAGE_KEY_EXPENSES, STORAGE_KEY_STOCKS, livePricesMap, STORAGE_KEY_PRICES, inputApiUrl, STORAGE_KEY_GAS_URL
    } = ctx;

    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找
    const renderCharts = (...args) => ctx.renderCharts(...args);
    const fetchStockPrices = (...args) => ctx.fetchStockPrices(...args);

    // ================= 雲端同步（版本號 + 安全保護） =================
    // 同步流程與狀態在 js/data/sync.js，與後端溝通在 js/data/api.js，資料轉換在 js/data/convert.js。
    // 這裡只負責接到畫面：狀態徽章、確認視窗、失敗提示、把雲端資料套用到畫面。
    const api = createApi();
    const engine = createSyncEngine({
        api,
        storage: localStorage,
        getUrl: () => gasApiUrl.value,
        getData: () => ({ expenses: expenses.value, settings: appSettings.value, stockTrades: stockTrades.value }),
        hooks: {
            onState: (s) => { syncState.value = s; },
            onBusy: (b) => { isSyncing.value = b; },
            confirm: (kind, info) => {
                if (kind === 'conflict') return askConfirm({ title: '另一台裝置已更新過資料', message: '要載入雲端最新資料嗎？\n本機尚未同步的修改會被取代。', confirmText: '載入雲端資料', cancelText: '先保留本機', danger: true });
                if (kind === 'shrink') return askConfirm({ title: '⚠️ 上傳筆數明顯變少', message: `雲端目前有 ${info.cloudCount} 筆紀錄，但這次只要上傳 ${info.newCount} 筆。\n這通常代表本機資料不完整。\n\n建議按「取消」，改按「同步」載入雲端資料。`, confirmText: '仍要覆蓋雲端', danger: true });
                return askConfirm({ title: '雲端是空的', message: '雲端試算表目前是空的，但本機有資料。\n要把本機資料上傳到雲端嗎？', confirmText: '上傳' });
            },
            applyData: (data) => {
                expenses.value = data.expenses || [];
                stockTrades.value = data.stockTrades || [];
                if (data.settings && typeof data.settings === 'object' && Object.keys(data.settings).length) {
                    appSettings.value = withDefaultSettings(data.settings);
                    if (Array.isArray(data.settings.hiddenOptions)) blacklistedOptions.value = [...appSettings.value.hiddenOptions];   // 雲端為準
                    else appSettings.value.hiddenOptions = [...blacklistedOptions.value];                                             // 雲端還沒有這項設定：沿用本機的
                }
                clearUndo();
            },
            nextTick: () => nextTick(),
            afterApply: () => { refreshDynamicOptions(); nextTick(() => renderCharts()); },
            afterSync: () => { fetchStockPrices(true); },
            onFailure: (silent) => notifySyncFailure(silent)
        }
    });
    const syncState = ref(engine.initialState());
    const syncBadge = computed(() => ({
        idle:     { text: '雲端已連線', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
        ok:       { text: '雲端已同步', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
        syncing:  { text: '同步中…',   cls: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
        dirty:    { text: '尚未同步',   cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
        error:    { text: '離線／同步失敗', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
        conflict: { text: '需處理衝突', cls: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
        local:    { text: '', cls: '' }
    }[syncState.value] || { text: '', cls: '' }));
    // 使用者有修改 → 標記未同步並延遲上傳（22 處呼叫點沿用這個名稱）
    const pushToCloud = () => engine.markEdited();
    const pushNow = (force = false) => engine.pushNow(force);
    const syncFromCloud = async (silent = false) => {
        silent = (silent === true);   // 避免 @click 傳入事件物件
        const r = await engine.syncFromCloud({ silent });
        if (r === 'no-url' && !silent) { showToast('請先在右上角「工具 → API 設定」輸入 Google Apps Script 網址。', 'error'); showApiConfigModal.value = true; }
        else if (r === 'synced' && !silent) showToast('已從 Google 試算表同步資料');
    };
    watch(expenses, (val) => {
        localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(val));
        refreshDynamicOptions();
        pushToCloud();
    }, { deep: true });
    watch(stockTrades, (val) => {
        localStorage.setItem(STORAGE_KEY_STOCKS, JSON.stringify(val));
        pushToCloud();
    }, { deep: true });
    watch(livePricesMap, (val) => localStorage.setItem(STORAGE_KEY_PRICES, JSON.stringify(val)), { deep: true });
    const saveApiUrl = () => {
        const newUrl = inputApiUrl.value.trim();
        if (newUrl !== gasApiUrl.value) engine.resetRev();   // 換了雲端，舊版本號作廢
        gasApiUrl.value = newUrl;
        localStorage.setItem(STORAGE_KEY_GAS_URL, gasApiUrl.value);
        showApiConfigModal.value = false;
        syncState.value = gasApiUrl.value ? 'idle' : 'local';
        if (gasApiUrl.value) syncFromCloud();
    };
    const resetAllData = () => {
        {   // 確認步驟已移到「清空重來」視窗（需輸入文字確認）
            expenses.value = [];
            stockTrades.value = [];
            livePricesMap.value = {};
            localStorage.removeItem(STORAGE_KEY_EXPENSES);
            localStorage.removeItem(STORAGE_KEY_STOCKS);
            localStorage.removeItem(STORAGE_KEY_PRICES);
            engine.setDirty(true);
            pushNow(true);
            showToast('已清空所有紀錄');
            nextTick(() => renderCharts());
        }
    };

    return {
        api, syncState, syncBadge, pushToCloud, syncFromCloud, saveApiUrl,
        resetAllData
    };
};
