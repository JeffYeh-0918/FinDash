import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic/ledger.js';

const st = L.withDefaultSettings(null);
const E = (o) => ({ type: '支出', date: '2026-03-10', category: '變動支出', item: '飲食費', amount: 100, paidAmount: 0, paymentMethod: '現金', settlementDate: '', ...o });

test('舊設定沒有 categoryColors 也不爆', () => {
  assert.deepEqual(st.categoryColors, {});
  assert.deepEqual(L.withDefaultSettings({ passThroughCategories: ['墊付'] }).passThroughCategories, ['墊付']);
});
test('代墊：消費月墊付、結算日月收回（跨月）', () => {
  const r = L.calcLedger([E({ category: '墊付', item: '代買', amount: 1000, settlementDate: '2026-05-02' })], st);
  assert.equal(r.months['2026-03'].advanceOut, 1000); assert.equal(r.months['2026-03'].advanceIn, 0);
  assert.equal(r.months['2026-05'].advanceIn, 1000); assert.equal(r.months['2026-05'].advanceOut, 0);
  assert.equal(L.deriveLedger(r.months['2026-03']).advance, 1000);
  assert.equal(L.deriveLedger(r.months['2026-05']).advance, -1000);
  assert.equal(L.deriveLedger(r.months['2026-05']).after, 1000);
  assert.equal(r.years['2026'].advanceOut, 1000); assert.equal(r.years['2026'].advanceIn, 1000);
});
test('代墊：跨年結算日，年度各算各的', () => {
  const r = L.calcLedger([E({ category: '墊付', item: 'x', amount: 500, date: '2025-12-20', settlementDate: '2026-01-05' })], st);
  assert.equal(r.years['2025'].advanceOut, 500); assert.equal(r.years['2025'].advanceIn, 0);
  assert.equal(r.years['2026'].advanceIn, 500);
});
test('代墊：沒填結算日＝還沒收回；不算消費、不算收入', () => {
  const d = L.deriveLedger(L.calcLedger([E({ category: '墊付', item: 'x', amount: 300 })], st).months['2026-03']);
  assert.equal(d.advance, 300); assert.equal(d.consume, 0); assert.equal(d.income, 0); assert.equal(d.after, -300);
});
test('代墊類別的「收入」不計入（不是收入、也不是收回）', () => {
  const r = L.calcLedger([E({ type: '收入', category: '墊付', item: 'x', amount: 700 })], st);
  const b = r.months['2026-03'];
  assert.equal(b.income, 0); assert.equal(b.advanceIn, 0); assert.equal(b.advanceOut, 0);
});
test('非代墊類別填結算日不影響月收支表', () => {
  const r = L.calcLedger([E({ amount: 200, settlementDate: '2026-04-01' })], st);
  assert.equal(r.months['2026-04'], undefined); assert.equal(r.months['2026-03'].consume, 200);
});
test('結算日格式不合法就忽略', () => {
  assert.equal(L.calcLedger([E({ category: '墊付', item: 'x', amount: 100, settlementDate: '未填' })], st).months['2026-03'].advanceIn, 0);
});
test('圖表：代墊永遠不出現；含投資只加回投資', () => {
  const list = [E({ amount: 100 }), E({ category: '墊付', item: 'x', amount: 900 }), E({ category: '投資儲蓄', item: 'ETF投資', amount: 5000 })];
  const items = (inc) => L.buildItemRows(list, st, inc).map(r => r.e.item).sort();
  assert.deepEqual(items(false), ['飲食費']);
  assert.deepEqual(items(true), ['ETF投資', '飲食費']);
  const pay = (inc) => L.aggregatePayments(list, st, inc).reduce((s, x) => s + x[1], 0);
  assert.equal(pay(false), 100); assert.equal(pay(true), 5100);
});
test('類別同時在兩個清單時以代墊為準', () => {
  const s = L.withDefaultSettings({ nonConsumptionCategories: ['墊付'], passThroughCategories: ['墊付'] });
  assert.equal(L.categoryKindOf(s, '墊付'), 'pass'); assert.equal(L.categoryKindOf(s, '固定支出'), 'normal'); assert.equal(L.categoryKindOf(st, '投資儲蓄'), 'noncons');
});
test('顏色：預設對照、新類別依序分配且不重複、已有的不動', () => {
  const s = L.withDefaultSettings(null);
  assert.equal(L.assignCategoryColors(s, ['固定支出', '墊付', '新A', '新B']), true);
  assert.equal(s.categoryColors['固定支出'], '#6366f1'); assert.equal(s.categoryColors['墊付'], '#ef4444');
  assert.notEqual(s.categoryColors['新A'], s.categoryColors['新B']);
  s.categoryColors['固定支出'] = '#123456';
  assert.equal(L.assignCategoryColors(s, ['固定支出', '新A']), false); assert.equal(s.categoryColors['固定支出'], '#123456');
  assert.ok(!Object.values(L.DEFAULT_CATEGORY_COLORS).some(c => L.EXTRA_PALETTE.includes(c)), '擴充色盤不可與預設色重複');
});

// ---- V19：圖表類別篩選／付款管道依類別堆疊 ----
const V19 = [
  E({ category: '保險', item: '保險費', amount: 3025, paymentMethod: '信用卡A' }),
  E({ category: '變動支出', item: '購物', amount: 1500, paymentMethod: '信用卡A' }),
  E({ category: '變動支出', item: '醫療', amount: 650, paymentMethod: '現金' }),
  E({ category: '固定支出', item: '電話費', amount: 599, paymentMethod: '信用卡B' }),
  E({ category: '投資儲蓄', item: 'ETF投資', amount: 5000, paymentMethod: '銀行轉帳' }),
  E({ category: '墊付', item: '代買', amount: 800, paymentMethod: '現金' }),
  E({ type: '收入', category: '固定收入', item: '薪資', amount: 50000, paymentMethod: '銀行轉帳' }),
  E({ category: '變動支出', item: '免費', amount: 0, paymentMethod: '現金' }),
];
test('V19 excludeCategories：隱藏指定類別；沒隱藏時原樣回傳（同一個陣列）', () => {
  assert.equal(L.excludeCategories(V19, []), V19); assert.equal(L.excludeCategories(V19, undefined), V19);
  assert.equal(L.excludeCategories(V19, ['保險']).some(e => e.category === '保險'), false);
  assert.equal(L.excludeCategories(V19, ['保險']).length, V19.length - 1);
  assert.equal(L.excludeCategories([E({ category: '' })], ['(未分類)']).length, 0);   // 沒有類別＝「(未分類)」
});
test('V19 chartCategoryTotals：與付款管道圖同一套規則（不含收入、代墊、預設不含投資），金額大的在前', () => {
  assert.deepEqual(L.chartCategoryTotals(V19, st, false), [['保險', 3025], ['變動支出', 2150], ['固定支出', 599]]);
  assert.deepEqual(L.chartCategoryTotals(V19, st, true).map(x => x[0]), ['投資儲蓄', '保險', '變動支出', '固定支出']);
});
test('V19 aggregatePaymentsByCategory：每個管道依類別分段，總額與原本的 aggregatePayments 一致', () => {
  for (const inc of [false, true]) {
    const r = L.aggregatePaymentsByCategory(V19, st, inc), old = L.aggregatePayments(V19, st, inc);
    assert.deepEqual(r.rows.map(x => [x.method, x.total]), old);
    r.rows.forEach(x => assert.equal(Object.values(x.cats).reduce((a, b) => a + b, 0), x.total));
  }
  const r = L.aggregatePaymentsByCategory(V19, st, false);
  assert.deepEqual(r.categories, ['保險', '變動支出', '固定支出']);
  assert.deepEqual(r.rows[0], { method: '信用卡A', total: 4525, cats: { '保險': 3025, '變動支出': 1500 } });
});
test('V19 隱藏類別後再彙總：總額只算看得到的類別，沒金額的管道消失', () => {
  const vis = L.excludeCategories(V19, ['保險', '固定支出']);
  const r = L.aggregatePaymentsByCategory(vis, st, false);
  assert.deepEqual(r.rows.map(x => [x.method, x.total]), [['信用卡A', 1500], ['現金', 650]]);
  assert.deepEqual(r.categories, ['變動支出']);
  assert.deepEqual(L.aggregatePaymentsByCategory(L.excludeCategories(V19, ['保險', '變動支出', '固定支出']), st, false), { categories: [], rows: [] });
});
test('V19 項目圖：隱藏類別後前 5 名重新計算（保險費不再占榜）', () => {
  const top = (hidden) => L.aggregateItems(L.buildItemRows(L.excludeCategories(V19, hidden), st, false), 5).map(x => x.item);
  assert.deepEqual(top([]), ['保險費', '購物', '醫療', '電話費']);
  assert.deepEqual(top(['保險']), ['購物', '醫療', '電話費']);
});

// ---- V20：付款管道圖截斷／占比 ----
test('V20 clipPlan：最大的超過第二大 3 倍才截斷；刻度上限取整齊數字', () => {
  const p = L.clipPlan([18000, 3900, 910, 790, 45]);
  assert.equal(p.max, 5500); assert.deepEqual(p.indexes, [0]);
  assert.deepEqual(L.clipPlan([18000, 9000, 100]), { max: null, indexes: [] });        // 沒超過 3 倍：不截斷
  assert.deepEqual(L.clipPlan([3900]), { max: null, indexes: [] });                     // 只有一條：不截斷
  assert.deepEqual(L.clipPlan([]), { max: null, indexes: [] });
  assert.deepEqual(L.clipPlan([0, 0]), { max: null, indexes: [] });
});
test('V20 clipPlan：順序不影響結果、回傳的是原順序的索引；max 一定大於第二大', () => {
  const t = [790, 18000, 3900, 45], p = L.clipPlan(t);
  assert.deepEqual(p.indexes, [1]); assert.ok(p.max > 3900 && p.max < 18000);
  const t2 = [100, 10000, 20, 120]; const p2 = L.clipPlan(t2); assert.deepEqual(p2.indexes, [1]); assert.ok(p2.max >= 120 * 1.35);
});
test('V20 shareData：每個管道各類別百分比加總 100，與金額一致', () => {
  const pay = L.aggregatePaymentsByCategory(V19, st, false), d = L.shareData(pay);
  assert.equal(d.length, pay.categories.length);
  pay.rows.forEach((r, i) => { assert.ok(Math.abs(d.reduce((s, c) => s + c[i], 0) - 100) < 1e-9); });
  const insIdx = pay.categories.indexOf('保險'), cardIdx = pay.rows.findIndex(r => r.method === '信用卡A');
  assert.ok(Math.abs(d[insIdx][cardIdx] - (3025 / 4525) * 100) < 1e-9);
  assert.deepEqual(L.shareData({ categories: ['x'], rows: [{ total: 0, cats: {} }] }), [[0]]);   // 總額 0 不會除以 0
});
