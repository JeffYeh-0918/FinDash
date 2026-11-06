// FinDash 功能模組：設定視窗：類別與項目、付款與帳單、清空重來
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（主程式與其他模組的成員）。
import { categoryKindOf, isFundingEvent, findCategoryMismatches, suggestCategoryFor } from '../logic/ledger.js';

const { ref, computed, nextTick } = Vue;

export const useSettingsUi = (ctx) => {
    const { appSettings, categoriesList, itemsList, expenses, expenseForm, pushToCloud, showCardSettingsModal, resetAllData, captureUndo, armUndo, renderCharts } = ctx;

    // ---------- 預付與儲值設定 ----------
    const showFlowSettingsModal = ref(false);
    const categoryKind = (cat) => categoryKindOf(appSettings.value, cat);
    const setCategoryKind = (cat, kind) => {
        const st = appSettings.value;
        st.nonConsumptionCategories = st.nonConsumptionCategories.filter(c => c !== cat);
        st.passThroughCategories = (st.passThroughCategories || []).filter(c => c !== cat);
        if (kind === 'noncons') st.nonConsumptionCategories.push(cat);
        else if (kind === 'pass') st.passThroughCategories.push(cat);
    };
    const colorPanelCat = ref('');
    const toggleColorPanel = (cat) => { colorPanelCat.value = colorPanelCat.value === cat ? '' : cat; };
    const setCategoryColor = (cat, color) => {
        if (!/^#[0-9a-fA-F]{6}$/.test(color || '')) return;
        const st = appSettings.value;
        if (!st.categoryColors) st.categoryColors = {};
        st.categoryColors[cat] = color.toLowerCase();
    };
    const toggleFlowList = (key, value) => {
        const list = appSettings.value[key];
        const i = list.indexOf(value);
        if (i >= 0) list.splice(i, 1); else list.push(value);
    };
    const addFundingRule = () => appSettings.value.fundingRules.push({ category: categoriesList.value[0] || '', item: itemsList.value[0] || '' });
    const removeFundingRule = (i) => appSettings.value.fundingRules.splice(i, 1);
    const fundingMatchCount = computed(() => expenses.value.filter(e => e.type === '支出' && isFundingEvent(e, appSettings.value)).length);
    const prepaidUseCount = computed(() => expenses.value.filter(e => appSettings.value.prepaidMethods.includes(e.paymentMethod)).length);
    // ---------- 新增收支：依類別分組顯示項目，避免選錯 ----------
    const itemsByCategory = computed(() => {
        const m = {};
        expenses.value.forEach(e => { if (e.category && e.item) { const c = (m[e.category] = m[e.category] || {}); c[e.item] = (c[e.item] || 0) + 1; } });
        return m;
    });
    const itemGroups = (cat) => {
        const counts = itemsByCategory.value[cat] || {};
        const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).filter(i => itemsList.value.includes(i));
        return { common, others: itemsList.value.filter(i => !common.includes(i)) };
    };
    // ---------- 類別與項目對照 ----------
    const showCategoryMapModal = ref(false);
    const catMapKeys = computed(() => Object.keys(appSettings.value.categoryItems));
    const allowedItems = (cat) => { const m = appSettings.value.categoryItems[cat]; return (m === undefined || m === '*') ? itemsList.value : m; };
    const formCategories = computed(() => {
        const keys = catMapKeys.value, cur = expenseForm.value && expenseForm.value.category;
        return cur && !keys.includes(cur) ? [...keys, cur] : keys;     // 編輯舊紀錄時，保留它原本的（不在表內的）類別
    });
    const formItems = computed(() => {
        const list = allowedItems(expenseForm.value.category), cur = expenseForm.value.item;
        return { list, legacy: cur && !list.includes(cur) ? cur : '' };
    });
    const onCategoryChange = (ev) => {
        const list = allowedItems(ev.target.value);
        if (list.length && !list.includes(expenseForm.value.item)) expenseForm.value.item = list[0];
    };
    const isAllItems = (cat) => appSettings.value.categoryItems[cat] === '*';
    const toggleAllItems = (cat) => {
        const m = appSettings.value.categoryItems;
        if (m[cat] === '*') m[cat] = Array.from(new Set(expenses.value.filter(e => e.category === cat && e.item).map(e => e.item)));
        else m[cat] = '*';
    };
    const catHasItem = (cat, it) => { const m = appSettings.value.categoryItems[cat]; return m === '*' || (Array.isArray(m) && m.includes(it)); };
    const toggleCatItem = (cat, it) => {
        const m = appSettings.value.categoryItems[cat];
        if (!Array.isArray(m)) return;
        const i = m.indexOf(it);
        if (i >= 0) m.splice(i, 1); else m.push(it);
    };
    const allKnownItems = computed(() => Array.from(new Set([...itemsList.value, ...Object.values(appSettings.value.categoryItems).filter(Array.isArray).flat()])));
    const mismatchGroups = computed(() => findCategoryMismatches(expenses.value, appSettings.value.categoryItems));
    const mismatchTotal = computed(() => mismatchGroups.value.reduce((a, g) => a + g.count, 0));
    const fixTarget = ref({});
    const getFixTarget = (g) => fixTarget.value[g.key] !== undefined ? fixTarget.value[g.key] : suggestCategoryFor(g.item, g.category, appSettings.value.categoryItems);
    const applyCategoryFix = (g) => {
        const target = getFixTarget(g);
        if (!target) return;
        const ids = new Set(g.ids.map(String));
        captureUndo();
        expenses.value.forEach(e => { if (ids.has(String(e.id))) e.category = target; });
        pushToCloud();
        armUndo(`已將 ${g.count} 筆「${g.item}」的類別改成「${target}」`);
        nextTick(() => renderCharts());
    };
    // ---------- 設定視窗（分頁）與清空重來 ----------
    const catTab = ref('map');
    // 類別與項目：'map' 類別涵蓋的項目｜'options' 選項增刪
    const payTab = ref('methods');
    // 付款與帳單：'methods' 付款方式｜'rules' 儲值事件與消費定義
    const openCategorySettings = (tab = 'map') => { catTab.value = tab; showCategoryMapModal.value = true; };
    const openPaymentSettings = (tab = 'methods') => { payTab.value = tab; showCardSettingsModal.value = true; };
    const showResetModal = ref(false);
    const resetConfirmText = ref('');
    const openResetModal = () => { resetConfirmText.value = ''; showResetModal.value = true; };
    const confirmResetAll = () => {
        if (resetConfirmText.value.trim() !== '清空') return;
        showResetModal.value = false;
        resetAllData();
    };

    return { showFlowSettingsModal, categoryKind, setCategoryKind, colorPanelCat, toggleColorPanel, setCategoryColor, toggleFlowList, addFundingRule, removeFundingRule, fundingMatchCount, prepaidUseCount, itemGroups, showCategoryMapModal, catMapKeys, allowedItems, formCategories, formItems, onCategoryChange, isAllItems, toggleAllItems, catHasItem, toggleCatItem, allKnownItems, mismatchGroups, mismatchTotal, fixTarget, getFixTarget, applyCategoryFix, catTab, payTab, openCategorySettings, openPaymentSettings, showResetModal, resetConfirmText, openResetModal, confirmResetAll };
};
