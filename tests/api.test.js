import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi, buildUrl } from '../js/data/api.js';
import { fromCloudData, toCloudPayload, normDate, parseSymbolFromCloud } from '../js/data/convert.js';

// 假的 fetch：記錄呼叫，回傳指定內容
const fakeFetch = (body, { ok = true } = {}) => { const calls = []; const f = async (url, opt) => { calls.push({ url, opt }); return { ok, json: async () => body }; }; f.calls = calls; return f; };

test('buildUrl：有無既有參數都正確，並附時間戳', () => {
  assert.match(buildUrl('https://x/exec', 'action=data'), /^https:\/\/x\/exec\?action=data&_=\d+$/);
  assert.match(buildUrl('https://x/exec?a=1', 'action=data'), /^https:\/\/x\/exec\?a=1&action=data&_=\d+$/);
});
test('normDate：各種日期格式統一', () => {
  assert.equal(normDate('2026/10/3'), '2026-10-03'); assert.equal(normDate('2026-1-5'), '2026-01-05');
  assert.equal(normDate('2026-10-03T00:00:00.000Z'), '2026-10-03'); assert.equal(normDate(''), '');
});
test('fromCloudData：日期統一、股票代碼清單引號且保留開頭 00', () => {
  const d = fromCloudData({ status: 'success', rev: 3, expenses: [{ date: '2026/3/4', paymentDate: '', settlementDate: '2026-4-1' }], stockTrades: [{ date: '2026/3/4', symbol: "'009803" }], settings: { a: 1 } });
  assert.equal(d.rev, 3); assert.equal(d.expenses[0].date, '2026-03-04'); assert.equal(d.expenses[0].settlementDate, '2026-04-01');
  assert.equal(d.stockTrades[0].symbol, '009803'); assert.deepEqual(d.settings, { a: 1 });
});
test('fromCloudData：錯誤回應原樣回傳；缺陣列補空陣列', () => {
  assert.deepEqual(fromCloudData({ status: 'error', message: 'x' }), { status: 'error', message: 'x' });
  const d = fromCloudData({ status: 'success' }); assert.deepEqual(d.expenses, []); assert.deepEqual(d.stockTrades, []);
});
test('toCloudPayload：代碼去 .TW 與單引號、轉大寫；force 轉布林', () => {
  const p = toCloudPayload({ baseRev: 2, force: undefined, expenses: [], settings: {}, stockTrades: [{ symbol: "'00945b.TW" }, { symbol: '0050' }] });
  assert.deepEqual(p.stockTrades.map(t => t.symbol), ['00945B', '0050']); assert.equal(p.force, false); assert.equal(p.baseRev, 2);
  assert.equal(parseSymbolFromCloud("'009803"), '009803');
});
test('api.pushAll：POST、text/plain、body 帶 baseRev', async () => {
  const f = fakeFetch({ status: 'success', rev: 5 }); const api = createApi({ fetchImpl: f });
  const r = await api.pushAll('https://x/exec', { baseRev: 4, force: false, expenses: [{ id: 1 }], settings: {}, stockTrades: [] });
  assert.equal(r.rev, 5); const c = f.calls[0];
  assert.equal(c.url, 'https://x/exec'); assert.equal(c.opt.method, 'POST'); assert.match(c.opt.headers['Content-Type'], /^text\/plain/);
  const body = JSON.parse(c.opt.body); assert.equal(body.baseRev, 4); assert.equal(body.expenses.length, 1);
});
test('api.fetchAll：GET action=data 並轉換資料', async () => {
  const f = fakeFetch({ status: 'success', rev: 1, expenses: [{ date: '2026/1/2' }], stockTrades: [] }); const api = createApi({ fetchImpl: f });
  const d = await api.fetchAll('https://x/exec'); assert.match(f.calls[0].url, /action=data/); assert.equal(d.expenses[0].date, '2026-01-02');
});
test('api.fetchPrices：代碼以逗號串接並編碼', async () => {
  const f = fakeFetch({ status: 'success', prices: {} }); await createApi({ fetchImpl: f }).fetchPrices('https://x/exec', ['0050', '00945B']);
  assert.match(f.calls[0].url, /action=prices&symbols=0050%2C00945B/);
});
test('api.fetchFinMindClose：請求失敗回 null、成功回資料', async () => {
  assert.equal(await createApi({ fetchImpl: fakeFetch({}, { ok: false }) }).fetchFinMindClose('0050', '2026-01-01'), null);
  const f = fakeFetch({ data: [1] }); assert.deepEqual(await createApi({ fetchImpl: f }).fetchFinMindClose('0050', '2026-01-01'), { data: [1] });
  assert.match(f.calls[0].url, /data_id=0050&start_date=2026-01-01/);
});
