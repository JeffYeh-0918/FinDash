import test from 'node:test';
import assert from 'node:assert/strict';
import { calcRealized, calcDividends, cardPeriod, sortTrades } from '../js/logic/trades.js';
import { cleanSymbol } from '../js/logic/symbol.js';
test('股票代碼：保留開頭的 00、去 .TW、去開頭單引號、轉大寫', () => {
  assert.equal(cleanSymbol("'009803"), '009803'); assert.equal(cleanSymbol('0050.TW'), '0050'); assert.equal(cleanSymbol(' 00945b '), '00945B'); assert.equal(cleanSymbol(null), '');
});
test('同日先買後賣', () => assert.deepEqual(sortTrades([{ date: 'd', action: '賣出' }, { date: 'd', action: '買進' }]).map(t => t.action), ['買進', '賣出']));
test('已實現損益：移動平均成本法', () => {
  const r = calcRealized([
    { date: '2026-01-01', action: '買進', symbol: '0050', shares: 100, totalAmount: 1000 },
    { date: '2026-02-01', action: '買進', symbol: '0050', shares: 100, totalAmount: 2000 },
    { date: '2026-03-01', action: '賣出', symbol: '0050', shares: 100, totalAmount: 2000 }]);
  assert.equal(r.total, 500);   // 平均成本 15，賣 100 股收 2000
});
test('賣出超過持有：超出部分記入 ignored', () => {
  const r = calcRealized([{ date: '2026-01-01', action: '買進', symbol: 'A', shares: 10, totalAmount: 100 }, { date: '2026-01-02', action: '賣出', symbol: 'A', shares: 20, totalAmount: 400 }]);
  assert.equal(r.ignored.length, 1); assert.equal(r.rows[0].shares, 10);
});
test('股息：項目或類別為股息，內容為代碼', () => assert.deepEqual(calcDividends([{ item: '股息', content: '0050', amount: 300, type: '收入' }]), { '0050': 300 }));
test('信用卡帳期：一般月份與短月', () => {
  assert.deepEqual(cardPeriod(15, 0, new Date(2026, 10, 5)), { start: '2026-10-16', end: '2026-11-15' });
  assert.deepEqual(cardPeriod(31, 0, new Date(2026, 1, 10)), { start: '2026-02-01', end: '2026-02-28' });
});
