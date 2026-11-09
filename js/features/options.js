// FinDash 功能模組：類別／項目／付款方式的選項清單與增刪改名
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。
import { renameInSettings as renameInSettingsOn, removeFromSettings as removeFromSettingsOn } from '../logic/settings-ops.js';
import { assignCategoryColors } from '../logic/ledger.js';

const { computed, ref, watch } = Vue;

export const useOptions = (ctx) => {
    // 取用前面模組已建立的成員
    const {
        selectedCategoryFilters, selectedItemFilters, selectedPaymentFilters, STORAGE_KEY_CATEGORIES, STORAGE_KEY_ITEMS, STORAGE_KEY_PAYMENTS,
        STORAGE_KEY_BLACKLIST, appSettings, expenses, showExpenseModal, expenseForm
    } = ctx;

    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找
    const askInput = (...args) => ctx.askInput(...args);
    const pushToCloud = (...args) => ctx.pushToCloud(...args);
    const askConfirm = (...args) => ctx.askConfirm(...args);

    const categoryFilterLabel = computed(() => {
        if (selectedCategoryFilters.value.length === 0) return '所有類別';
        if (selectedCategoryFilters.value.length === 1) return selectedCategoryFilters.value[0];
        return `已選 ${selectedCategoryFilters.value.length} 個類別`;
    });
    const itemFilterLabel = computed(() => {
        if (selectedItemFilters.value.length === 0) return '所有項目';
        if (selectedItemFilters.value.length === 1) return selectedItemFilters.value[0];
        return `已選 ${selectedItemFilters.value.length} 個項目`;
    });
    const paymentFilterLabel = computed(() => {
        if (selectedPaymentFilters.value.length === 0) return '所有付款方式';
        if (selectedPaymentFilters.value.length === 1) return selectedPaymentFilters.value[0];
        return `已選 ${selectedPaymentFilters.value.length} 個付款`;
    });
    const defaultCategories = ['固定支出', '變動支出', '投資儲蓄', '保險', '儲值', '墊付', '固定收入'];
    const defaultItems = ['交通費', '飲食費', '電話費', '剪頭髮', '保險費', '採買費', '每月費用', '出遊', '房租', '購物', '醫療', '額外交通費', '額外飲食費', 'ETF投資', 'ETF賣出', '薪資', '福利獎金', '年終', '年度獎金', '股息'];
    const defaultPayments = ['每月預付', '國泰信用卡', '玉山信用卡', '國泰帳戶', '玉山帳戶', '付現', '悠遊卡儲值', '待付', '已付'];
    const categoriesList = ref((() => {
        let v = null;
        try { v = JSON.parse(localStorage.getItem(STORAGE_KEY_CATEGORIES)); } catch (e) { v = null; }
        if (!Array.isArray(v)) return [...defaultCategories];
        // 一次性整理：舊版預設把「投資」「儲蓄」分開，改成合併的「投資儲蓄」。有紀錄在用的會由 refreshDynamicOptions 自動補回，不會遺失
        if (!localStorage.getItem('findash_mig_invest_cat_v1')) {
            localStorage.setItem('findash_mig_invest_cat_v1', '1');
            const had = v.includes('投資') || v.includes('儲蓄');
            v = v.filter(c => c !== '投資' && c !== '儲蓄');
            if (had && !v.includes('投資儲蓄')) v.splice(Math.min(2, v.length), 0, '投資儲蓄');
        }
        return v;
    })());
    const itemsList = ref(JSON.parse(localStorage.getItem(STORAGE_KEY_ITEMS)) || defaultItems);
    const paymentMethodsList = ref(JSON.parse(localStorage.getItem(STORAGE_KEY_PAYMENTS)) || defaultPayments);
    const blacklistedOptions = ref(JSON.parse(localStorage.getItem(STORAGE_KEY_BLACKLIST)) || []);
    const refreshDynamicOptions = () => {
        const catSet = new Set(categoriesList.value);
        const itemSet = new Set(itemsList.value);
        const paySet = new Set(paymentMethodsList.value);

        // 類別對照表裡有的類別與項目，也要出現在選項清單（使用者刪除過的不補）
        const cmap = (appSettings.value && appSettings.value.categoryItems) || {};
        Object.keys(cmap).forEach(c => { if (!blacklistedOptions.value.includes(c)) catSet.add(c); });
        Object.values(cmap).forEach(a => { if (Array.isArray(a)) a.forEach(it => { if (it && !blacklistedOptions.value.includes(it)) itemSet.add(it); }); });
        expenses.value.forEach(e => {
            if (e.category && !blacklistedOptions.value.includes(e.category)) catSet.add(e.category);
            if (e.item && !blacklistedOptions.value.includes(e.item)) itemSet.add(e.item);
            if (e.paymentMethod && !blacklistedOptions.value.includes(e.paymentMethod)) paySet.add(e.paymentMethod);
        });

        // 「已刪除」黑名單是唯一準則：連本機清單裡殘留的（例如別台裝置刪除後同步過來的）也要拿掉。
        // 本機清單只存在各裝置自己的瀏覽器，不會同步；黑名單才會同步，兩邊要以黑名單為準。
        const hidden = new Set(blacklistedOptions.value);
        categoriesList.value = Array.from(catSet).filter(x => !hidden.has(x));
        itemsList.value = Array.from(itemSet).filter(x => !hidden.has(x));
        paymentMethodsList.value = Array.from(paySet).filter(x => !hidden.has(x));

        localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categoriesList.value));
        localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(itemsList.value));
        localStorage.setItem(STORAGE_KEY_PAYMENTS, JSON.stringify(paymentMethodsList.value));
        localStorage.setItem(STORAGE_KEY_BLACKLIST, JSON.stringify(blacklistedOptions.value));
    };
    // 改名／刪除選項時的設定同步邏輯在 js/logic/settings-ops.js，這裡只負責帶入目前設定
    const renameInSettings = (type, oldVal, clean) => renameInSettingsOn(appSettings.value, type, oldVal, clean);
    const removeFromSettings = (type, val) => removeFromSettingsOn(appSettings.value, type, val);
    const editOptionName = async (type, index) => {
        let list = type === 'category' ? categoriesList.value : (type === 'item' ? itemsList.value : paymentMethodsList.value);
        const oldVal = list[index];
        const newVal = await askInput({ title: '修改名稱', label: '會一併更新歷史紀錄與相關設定', value: oldVal });
        if (newVal && newVal.trim() && newVal.trim() !== oldVal) {
            const clean = newVal.trim();
            list[index] = clean;
            expenses.value.forEach(e => {
                if (type === 'category' && e.category === oldVal) e.category = clean;
                if (type === 'item' && e.item === oldVal) e.item = clean;
                if (type === 'payment' && e.paymentMethod === oldVal) e.paymentMethod = clean;
            });
            renameInSettings(type, oldVal, clean);
            refreshDynamicOptions();
            pushToCloud();
        }
    };
    const deleteOptionItem = async (type, index) => {
        let list = type === 'category' ? categoriesList.value : (type === 'item' ? itemsList.value : paymentMethodsList.value);
        const targetVal = list[index];
        const extra = type === 'payment' ? '\n（歷史紀錄不受影響；這個付款方式的信用卡結帳日、預付類設定會一併移除）' : '\n（歷史紀錄不受影響）';
        if (await askConfirm({ title: '從選單移除', message: `確定要將「${targetVal}」從選單移除嗎？${extra}`, confirmText: '移除', danger: true })) {
            list.splice(index, 1);
            if (!blacklistedOptions.value.includes(targetVal)) {
                blacklistedOptions.value.push(targetVal);
            }
            removeFromSettings(type, targetVal);
            appSettings.value.hiddenOptions = [...blacklistedOptions.value];   // 已刪除的選項會跟著設定同步到雲端
            refreshDynamicOptions();
        }
    };
    watch(appSettings, (v) => { localStorage.setItem('findash_settings_v1', JSON.stringify(v)); pushToCloud(); }, { deep: true });
    // 新類別、或雲端設定還沒有顏色時，自動分配並固定
    watch([categoriesList, () => Object.keys(appSettings.value.categoryItems).join('|'), () => Object.keys(appSettings.value.categoryColors || {}).length], () => {
        assignCategoryColors(appSettings.value, Array.from(new Set([...Object.keys(appSettings.value.categoryItems), ...categoriesList.value])));
    }, { deep: true, immediate: true });
    const promptAddOption = async (type) => {
        const val = await askInput({ title: '新增', label: '請輸入新增名稱' });
        if (val && val.trim()) {
            const clean = val.trim();
            if (type === 'category') {
                if (!categoriesList.value.includes(clean)) categoriesList.value.push(clean);
                if (!appSettings.value.categoryItems[clean]) appSettings.value.categoryItems[clean] = '*';   // 新類別先允許全部項目，之後可在「類別與項目對照」調整
                if (showExpenseModal.value) expenseForm.value.category = clean;
            }
            if (type === 'item') {
                if (!itemsList.value.includes(clean)) itemsList.value.push(clean);
                if (showExpenseModal.value) {   // 在新增收支表單裡新增項目：加到目前選的類別，並直接選取
                    const m = appSettings.value.categoryItems[expenseForm.value.category];
                    if (Array.isArray(m) && !m.includes(clean)) m.push(clean);
                    expenseForm.value.item = clean;
                }
            }
            if (type === 'payment' && !paymentMethodsList.value.includes(clean)) paymentMethodsList.value.push(clean);
            blacklistedOptions.value = blacklistedOptions.value.filter(b => b !== clean);
            appSettings.value.hiddenOptions = [...blacklistedOptions.value];
            refreshDynamicOptions();
        }
    };

    return {
        categoryFilterLabel, itemFilterLabel, paymentFilterLabel, categoriesList, itemsList, paymentMethodsList,
        blacklistedOptions, refreshDynamicOptions, editOptionName, deleteOptionItem, promptAddOption
    };
};
