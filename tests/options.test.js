import test from 'node:test';
import assert from 'node:assert/strict';
import { withDefaultSettings } from '../js/logic/ledger.js';

// 假的 Vue 與瀏覽器儲存（options.js 載入時會讀 Vue）
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.Vue = { ref: v => ({ value: v }), computed: fn => ({ get value() { return fn(); } }), watch() {} };
const { useOptions } = await import('../js/features/options.js');

const KEYS = { STORAGE_KEY_CATEGORIES: 'cats', STORAGE_KEY_ITEMS: 'items', STORAGE_KEY_PAYMENTS: 'pays', STORAGE_KEY_BLACKLIST: 'black' };
const setup = ({ items, blacklist = [], expenses = [], answer } = {}) => {
    Object.keys(store).forEach(k => delete store[k]);
    if (items) store.items = JSON.stringify(items);
    if (blacklist.length) store.black = JSON.stringify(blacklist);
    const r = (v) => ({ value: v });
    const ctx = { ...KEYS, selectedCategoryFilters: r([]), selectedItemFilters: r([]), selectedPaymentFilters: r([]), appSettings: r(withDefaultSettings(null)),
        expenses: r(expenses), showExpenseModal: r(false), expenseForm: r({}), askInput: async () => answer, askConfirm: async () => true, pushToCloud() {} };
    const api = useOptions(ctx);
    api.refreshDynamicOptions();
    return { api, ctx };
};
const items = (api) => api.itemsList.value;

test('預設項目含 ETF投資 與 ETF賣出（沒有被刪除時）', () => {
    const { api } = setup(); assert.ok(items(api).includes('ETF投資') && items(api).includes('ETF賣出'));
});
test('已刪除（黑名單）的項目，即使本機清單殘留，也不會出現在選單', () => {
    const { api } = setup({ items: ['飲食費', 'ETF賣出', 'ETF 賣出'], blacklist: ['ETF 賣出'] });
    assert.ok(!items(api).includes('ETF 賣出')); assert.ok(items(api).includes('ETF賣出'));
});
test('已刪除的類別、付款方式同樣不會殘留', () => {
    Object.keys(store).forEach(k => delete store[k]);
    store.cats = JSON.stringify(['固定支出', '舊類別']); store.pays = JSON.stringify(['現金', '舊付款']); store.black = JSON.stringify(['舊類別', '舊付款']);
    const r = (v) => ({ value: v });
    const api = useOptions({ ...KEYS, selectedCategoryFilters: r([]), selectedItemFilters: r([]), selectedPaymentFilters: r([]), appSettings: r(withDefaultSettings(null)), expenses: r([]), showExpenseModal: r(false), expenseForm: r({}), askInput() {}, askConfirm() {}, pushToCloud() {} });
    api.refreshDynamicOptions();
    assert.ok(!api.categoriesList.value.includes('舊類別')); assert.ok(!api.paymentMethodsList.value.includes('舊付款')); assert.ok(api.categoriesList.value.includes('固定支出'));
});
test('資料裡有用到、但已刪除的項目：不回到選單（歷史紀錄不受影響）', () => {
    const { api, ctx } = setup({ blacklist: ['ETF投資'], expenses: [{ id: 1, item: 'ETF投資', category: '投資儲蓄', amount: 1, paymentMethod: '現金' }] });
    assert.ok(!items(api).includes('ETF投資')); assert.equal(ctx.expenses.value.length, 1);
});
test('資料裡出現的新項目會自動進選單', () => {
    const { api } = setup({ expenses: [{ id: 1, item: '新項目X', category: '固定支出', amount: 1, paymentMethod: '現金' }] });
    assert.ok(items(api).includes('新項目X'));
});
test('使用者重新新增被刪除過的名稱：移出黑名單並出現在選單', async () => {
    const { api } = setup({ blacklist: ['ETF賣出'], answer: 'ETF賣出' });
    assert.ok(!items(api).includes('ETF賣出'));
    await api.promptAddOption('item'); api.refreshDynamicOptions();
    assert.ok(items(api).includes('ETF賣出'));
});
