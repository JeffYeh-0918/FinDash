import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine } from '../js/data/sync.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const memStorage = (init = {}) => { const s = { ...init }; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; }, _s: s }; };
// 建立測試環境：假 api（pushQ／fetchQ 依序回應）、記錄所有 hooks 的呼叫
const setup = ({ storage = memStorage(), url = 'https://x/exec', data, confirms = {}, pushQ = [], fetchQ = [] } = {}) => {
  const log = { states: [], confirms: [], applied: [], failures: [], pushes: [], afterSync: 0, afterApply: 0 };
  const api = {
    pushAll: async (u, args) => { log.pushes.push(args); const r = pushQ.shift(); if (r instanceof Error) throw r; return r; },
    fetchAll: async () => { const r = fetchQ.shift(); if (r instanceof Error) throw r; return r; }
  };
  const state = { data: data || { expenses: [{ id: 1 }], settings: {}, stockTrades: [] } };
  let engine;
  engine = createSyncEngine({
    api, storage, getUrl: () => url, getData: () => state.data, debounceMs: 5, retryMs: 5,
    hooks: {
      onState: s => log.states.push(s), applyData: d => log.applied.push(d), afterApply: () => { log.afterApply++; }, afterSync: () => { log.afterSync++; },
      onFailure: s => log.failures.push(s), confirm: async (k, info) => { log.confirms.push([k, info]); return confirms[k] ?? false; }
    }
  });
  return { engine, log, storage, state };
};
const OK = (rev) => ({ status: 'success', rev });
const CLOUD = (rev, n = 1) => ({ status: 'success', rev, expenses: Array.from({ length: n }, (_, i) => ({ id: i })), stockTrades: [], settings: {} });
let quiet; test.before(() => { quiet = console.warn; console.warn = () => {}; }); test.after(() => { console.warn = quiet; });

test('從未拉過雲端（rev 為 null）時，不會上傳', async () => {
  const { engine, log } = setup(); assert.equal(await engine.pushNow(), false); assert.equal(log.pushes.length, 0);
});
test('markEdited：立刻記為未同步，延遲後上傳成功 → 清除未同步、更新版本', async () => {
  const { engine, log, storage } = setup({ storage: memStorage({ findash_cloud_rev_v1: '4' }), pushQ: [OK(5)] });
  engine.markEdited(); assert.equal(engine.isDirty(), true); assert.equal(storage._s.findash_dirty_v1, '1'); assert.equal(log.pushes.length, 0);
  await sleep(40);
  assert.equal(log.pushes.length, 1); assert.equal(log.pushes[0].baseRev, 4); assert.equal(engine.isDirty(), false); assert.equal(engine.getRev(), '5');
  assert.deepEqual(log.states, ['dirty', 'syncing', 'ok']);
});
test('連續編輯會合併成一次上傳', async () => {
  const { engine, log } = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [OK(2)] });
  engine.markEdited(); engine.markEdited(); engine.markEdited(); await sleep(40); assert.equal(log.pushes.length, 1);
});
test('上傳期間又有修改：保持未同步，稍後再傳一次', async () => {
  const { engine, log } = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [OK(2), OK(3)] });
  const p = engine.pushNow(); engine.markEdited(); await p; assert.equal(engine.isDirty(), true);
  await sleep(40); assert.equal(log.pushes.length, 2); assert.equal(engine.isDirty(), false); assert.equal(engine.getRev(), '3');
});
test('衝突：使用者同意 → 載入雲端資料；拒絕 → 保留本機並停在 conflict', async () => {
  let t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [{ status: 'conflict' }], fetchQ: [CLOUD(9)], confirms: { conflict: true } });
  assert.equal(await t.engine.pushNow(), false); assert.equal(t.log.applied.length, 1); assert.equal(t.engine.getRev(), '9'); assert.equal(t.log.states.at(-1), 'ok'); assert.equal(t.log.afterSync, 1);
  t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [{ status: 'conflict' }], confirms: { conflict: false } });
  await t.engine.pushNow(); assert.equal(t.log.applied.length, 0); assert.equal(t.log.states.at(-1), 'conflict'); assert.equal(t.engine.getRev(), '1');
});
test('筆數縮水：拒絕 → 維持未同步；同意 → 帶 force 重送', async () => {
  let t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [{ status: 'shrink', cloudCount: 100, newCount: 3 }], confirms: { shrink: false } });
  assert.equal(await t.engine.pushNow(), false); assert.equal(t.log.states.at(-1), 'dirty'); assert.deepEqual(t.log.confirms[0], ['shrink', { cloudCount: 100, newCount: 3 }]); assert.equal(t.log.pushes.length, 1);
  t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [{ status: 'shrink', cloudCount: 100, newCount: 3 }, OK(2)], confirms: { shrink: true } });
  assert.equal(await t.engine.pushNow(), true); assert.equal(t.log.pushes[1].force, true);
});
test('網路錯誤或後端錯誤：狀態 error，並通知失敗', async () => {
  let t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [new Error('offline')] });
  assert.equal(await t.engine.pushNow(), false); assert.equal(t.log.states.at(-1), 'error'); assert.deepEqual(t.log.failures, [true]);
  t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1' }), pushQ: [{ status: 'error', message: '忙碌' }] });
  await t.engine.pushNow(); assert.equal(t.log.states.at(-1), 'error');
});
test('同步：沒有網址 → no-url；同時兩次 → 第二次 busy', async () => {
  assert.equal(await setup({ url: '' }).engine.syncFromCloud(), 'no-url');
  const t = setup({ fetchQ: [CLOUD(1)] }); const a = t.engine.syncFromCloud(); const b = await t.engine.syncFromCloud(); assert.equal(b, 'busy'); assert.equal(await a, 'synced');
});
test('同步：套用雲端資料、記下版本，且不算使用者修改', async () => {
  const t = setup({ fetchQ: [CLOUD(7)] });
  assert.equal(await t.engine.syncFromCloud(), 'synced'); assert.equal(t.engine.getRev(), '7'); assert.equal(t.engine.isDirty(), false); assert.equal(t.log.afterApply, 1);
});
test('套用雲端資料期間的變動不算使用者修改（suppressDirty）', async () => {
  const storage = memStorage(); let engine;
  const api = { fetchAll: async () => CLOUD(2), pushAll: async () => OK(3) };
  engine = createSyncEngine({ api, storage, getUrl: () => 'u', getData: () => ({ expenses: [], settings: {}, stockTrades: [] }), debounceMs: 5, hooks: { applyData: () => engine.markEdited() } });
  await engine.syncFromCloud(); await sleep(30); assert.equal(engine.isDirty(), false);
});
test('同步：本機有未上傳修改 → 先上傳再拉取；先上傳失敗則中止', async () => {
  let t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1', findash_dirty_v1: '1' }), pushQ: [OK(2)], fetchQ: [CLOUD(2)] });
  assert.equal(await t.engine.syncFromCloud(), 'synced'); assert.equal(t.log.pushes.length, 1);
  t = setup({ storage: memStorage({ findash_cloud_rev_v1: '1', findash_dirty_v1: '1' }), pushQ: [new Error('x')] });
  assert.equal(await t.engine.syncFromCloud(), 'aborted'); assert.equal(t.log.applied.length, 0);
});
test('雲端是空的、本機有資料、從未同步過：詢問後上傳；拒絕則照雲端覆蓋', async () => {
  let t = setup({ fetchQ: [CLOUD(0, 0)], pushQ: [OK(1)], confirms: { emptyCloud: true } });
  assert.equal(await t.engine.syncFromCloud(), 'pushed'); assert.equal(t.log.pushes[0].baseRev, 0); assert.equal(t.engine.getRev(), '1');
  t = setup({ fetchQ: [CLOUD(0, 0)], confirms: { emptyCloud: false } });
  assert.equal(await t.engine.syncFromCloud(), 'synced'); assert.equal(t.log.pushes.length, 0);
});
test('同步失敗：狀態 error，silent 旗標傳給失敗通知', async () => {
  const t = setup({ fetchQ: [new Error('offline')] }); assert.equal(await t.engine.syncFromCloud({ silent: true }), 'failed'); assert.deepEqual(t.log.failures, [true]); assert.equal(t.log.states.at(-1), 'error');
});
test('initialState 與 resetRev', () => {
  assert.equal(setup({ url: '' }).engine.initialState(), 'local');
  assert.equal(setup().engine.initialState(), 'idle');
  const t = setup({ storage: memStorage({ findash_dirty_v1: '1', findash_cloud_rev_v1: '3' }) }); assert.equal(t.engine.initialState(), 'dirty');
  t.engine.resetRev(); assert.equal(t.engine.getRev(), null); assert.equal('findash_cloud_rev_v1' in t.storage._s, false);
});
