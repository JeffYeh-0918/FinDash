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
