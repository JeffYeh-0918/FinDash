// FinDash 功能模組：核心資料與共用狀態（收支、股票、設定、篩選條件、彈窗開關、表單）
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。
import { parseSymbolFromCloud } from '../data/convert.js';
import { withDefaultSettings } from '../logic/ledger.js';

const { ref, provide, computed } = Vue;

export const useState = (ctx) => {
    const STORAGE_KEY_EXPENSES = 'findash_expenses_v2';
    const STORAGE_KEY_STOCKS = 'findash_stocks_v2';
    const STORAGE_KEY_PRICES = 'findash_stock_prices_v2';
    const STORAGE_KEY_GAS_URL = 'findash_gas_api_url';
    const STORAGE_KEY_CATEGORIES = 'findash_custom_categories_v1';
    const STORAGE_KEY_ITEMS = 'findash_custom_items_v1';
    const STORAGE_KEY_PAYMENTS = 'findash_custom_payments_v1';
    const STORAGE_KEY_BLACKLIST = 'findash_blacklisted_options_v1';
    const realNow = new Date();
    const currentRealYear = realNow.getFullYear();
    const currentRealMonth = realNow.getMonth() + 1;
    // 以「本地時間」取今天日期（toISOString 是 UTC，台灣凌晨 0~8 點會差一天）
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const fileInputRef = ref(null);
    const gasApiUrl = ref(localStorage.getItem(STORAGE_KEY_GAS_URL) || '');
    const inputApiUrl = ref(gasApiUrl.value);
    const showApiConfigModal = ref(false);
    const showOptionManagerModal = ref(false);
    const isSyncing = ref(false);
    const rawExpenses = JSON.parse(localStorage.getItem(STORAGE_KEY_EXPENSES)) || [];
    const rawStocks = JSON.parse(localStorage.getItem(STORAGE_KEY_STOCKS)) || [];
    const expenses = ref(rawExpenses);
    const stockTrades = ref(rawStocks.map(s => ({
        ...s,
        symbol: parseSymbolFromCloud(s.symbol)
    })));
    const livePricesMap = ref(JSON.parse(localStorage.getItem(STORAGE_KEY_PRICES)) || {});
    const activeTab = ref('expenses');
    const selectedYear = ref(currentRealYear);
    const selectedMonth = ref(currentRealMonth);
    const isFetchingPrices = ref(false);
    const lastPriceUpdate = ref('');
    const expenseSearch = ref('');
    const expenseMonthFilterScope = ref('MONTH');
    const selectedCategoryFilters = ref([]);
    const selectedItemFilters = ref([]);
    const selectedPaymentFilters = ref([]);
    const selectedTypeFilters = ref([]);
    const filterYears = ref([]);
    const filterMonths = ref([]);
    const activeDropdown = ref(null);
    const toggleDropdown = (name) => {
        activeDropdown.value = activeDropdown.value === name ? null : name;
    };
    const closeAllDropdowns = () => { activeDropdown.value = null; };
    provide('dropdown', { activeDropdown, toggleDropdown, closeAllDropdowns });
    const selectedExpenseIds = ref([]);
    const selectedStockIds = ref([]);
    const showExpenseModal = ref(false);
    const editingExpenseId = ref(null);
    const showStockModal = ref(false);
    const editingStockId = ref(null);
    const showBatchDateModal = ref(false);
    const showBatchCopyModal = ref(false);
    const targetCopyDate = ref(todayStr());
    const showImportHelpModal = ref(false);
    const batchDateType = ref('payment');
    const targetBatchDate = ref(todayStr());
    const expenseForm = ref({ type: '支出', date: todayStr(), category: '變動支出', item: '飲食費', content: '', amount: null, paidAmount: null, note: '', paymentMethod: '國泰信用卡', paymentDate: '', settlementDate: '' });
    const stockForm = ref({ action: '買進', date: todayStr(), symbol: '0050', name: '', price: null, shares: null, fee: 0, tax: 0 });
    const isCurrentMonthOrFuture = computed(() => (selectedYear.value > currentRealYear) || (selectedYear.value === currentRealYear && selectedMonth.value >= currentRealMonth));
    const roundTwo = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;
    const showRealizedModal = ref(false);
    // （PURE 區塊已移到 js/logic/，見檔頭 import）
    // ---------- 設定（信用卡結帳日），會同步到雲端 ----------
    // （LEDGER 區塊已移到 js/logic/，見檔頭 import）
    const appSettings = ref((() => { try { const v = JSON.parse(localStorage.getItem('findash_settings_v1')); return withDefaultSettings(v); } catch (e) { return withDefaultSettings(null); } })());
    const showCardSettingsModal = ref(false);
    const isCard = (name) => appSettings.value.creditCards.some(c => c.name === name);
    const getCardDay = (name) => (appSettings.value.creditCards.find(c => c.name === name) || {}).closingDay || '';
    // ---------- 支出圖表（項目長條＋付款管道） ----------
    const includeInvest = ref(false);
    const signedCurrency = (n) => `${n >= 0 ? '+' : '-'}${formatCurrency(Math.abs(n))}`;
    // ---------- 彈窗規則 ----------
    //  資訊型／設定型：Esc 與點背景都可關閉；表單型：Esc 可關閉、點背景不關，有未儲存內容時先詢問；危險型：只有明確按鈕或 Esc
    const expenseSnap = ref(''), stockSnap = ref('');
    // ---------- 分頁（預設 100 筆，捲到底再載入） ----------
    const PAGE_SIZE = 100;
    const visibleCount = ref(PAGE_SIZE);
    // ---------- 股票交易紀錄篩選 ----------
    const stockSearch = ref('');
    const stockFilterSymbols = ref('');
    const stockFilterActions = ref('');
    const stockFilterYears = ref('');
    const stockFilterMonths = ref('');
    // ---------- 股票交易 ↔ 收支 連動 ----------
    const DEFAULT_STOCK_PAY = '國泰帳戶';
    const formatCurrency = (val) => 'NT$ ' + Math.round(val || 0).toLocaleString('zh-TW');

    return {
        STORAGE_KEY_EXPENSES, STORAGE_KEY_STOCKS, STORAGE_KEY_PRICES, STORAGE_KEY_GAS_URL, STORAGE_KEY_CATEGORIES, STORAGE_KEY_ITEMS,
        STORAGE_KEY_PAYMENTS, STORAGE_KEY_BLACKLIST, todayStr, fileInputRef, gasApiUrl,
        inputApiUrl, showApiConfigModal, showOptionManagerModal, isSyncing, expenses, stockTrades,
        livePricesMap, activeTab, selectedYear, selectedMonth, isFetchingPrices, lastPriceUpdate,
        expenseSearch, expenseMonthFilterScope, selectedCategoryFilters, selectedItemFilters, selectedPaymentFilters, selectedTypeFilters,
        filterYears, filterMonths, activeDropdown, toggleDropdown, closeAllDropdowns, selectedExpenseIds,
        selectedStockIds, showExpenseModal, editingExpenseId, showStockModal, editingStockId, showBatchDateModal,
        showBatchCopyModal, targetCopyDate, showImportHelpModal, batchDateType, targetBatchDate, expenseForm,
        stockForm, isCurrentMonthOrFuture, roundTwo, showRealizedModal, appSettings, showCardSettingsModal,
        isCard, getCardDay, includeInvest, signedCurrency, expenseSnap, stockSnap,
        PAGE_SIZE, visibleCount, stockSearch, stockFilterSymbols, stockFilterActions, stockFilterYears,
        stockFilterMonths, DEFAULT_STOCK_PAY, formatCurrency
    };
};
