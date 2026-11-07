// 行為等價比對：用同一份假資料與固定日期，分別跑「舊版」與「新版」的 setup()，
// 把範本會用到的所有成員（ref／computed 取值、函式略過）序列化後逐項比對。
// 用法：node tools/equivalence.mjs <舊專案資料夾> <新專案資料夾>
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [, , oldRoot, newRoot] = process.argv;
const exp = (o) => ({ type: '支出', paidAmount: 0, paymentMethod: '現金', paymentDate: '', settlementDate: '', note: '', content: '', stockId: '', ...o });
const expenses = [
    exp({ id: 1, date: '2026-11-03', category: '固定支出', item: '飲食費', amount: 320, paymentMethod: '信用卡A' }),
    exp({ id: 2, date: '2026-11-04', category: '變動支出', item: '購物', amount: 1500, paymentMethod: '信用卡A' }),
    exp({ id: 3, date: '2026-10-28', category: '固定支出', item: '房租', amount: 12000, paymentMethod: '轉帳' }),
    exp({ id: 4, date: '2026-10-05', category: '墊付', item: '代買', amount: 900, settlementDate: '2026-11-02' }),
    exp({ id: 5, date: '2026-11-01', category: '墊付', item: '代買', amount: 450 }),
    exp({ id: 6, date: '2026-11-02', category: '投資儲蓄', item: 'ETF投資', amount: 5000, content: '0050', paymentMethod: '國泰帳戶', stockId: 101 }),
    exp({ id: 7, date: '2026-09-15', type: '收入', category: '固定收入', item: '薪資', amount: 60000 }),
    exp({ id: 8, date: '2026-11-05', type: '收入', category: '固定收入', item: '股息', amount: 300, content: '0050' }),
    exp({ id: 9, date: '2026-11-06', category: '儲值', item: '交通費', amount: 500, paymentMethod: '悠遊卡儲值', paidAmount: 0 }),
    exp({ id: 10, date: '2026-08-20', category: '保險', item: '保險費', amount: 2500, paymentMethod: '信用卡A' })
];
const stocks = [
    { id: 101, action: '買進', date: '2026-11-02', symbol: '0050', name: '元大台灣50', price: 50, shares: 100, fee: 20, tax: 0, totalAmount: 5020 },
    { id: 102, action: '買進', date: '2026-09-10', symbol: '009803', name: 'X', price: 15, shares: 200, fee: 10, tax: 0, totalAmount: 3010 },
    { id: 103, action: '賣出', date: '2026-10-10', symbol: '009803', name: 'X', price: 16, shares: 100, fee: 10, tax: 5, totalAmount: 1585 }
];
const settings = { creditCards: [{ name: '信用卡A', closingDay: 15 }], prepaidMethods: ['悠遊卡儲值'], passThroughCategories: ['墊付'], categoryColors: { 固定支出: '#123456' } };
const seed = { findash_expenses_v2: JSON.stringify(expenses), findash_stocks_v2: JSON.stringify(stocks), findash_settings_v1: JSON.stringify(settings),
    findash_stock_prices_v2: JSON.stringify({ '0050': { price: 52, isLive: true }, '009803': { price: 15.5, isLive: false } }), findash_gas_api_url: '' };

const HEAD = `
globalThis.setInterval = () => 0; globalThis.setTimeout = () => 0;
const RealDate = Date; const FIXED = new RealDate(2026, 10, 7, 12, 0, 0).getTime();
globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(FIXED); } static now() { return FIXED; } };
const store = ${JSON.stringify(seed)};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear() {} };
const el = () => new Proxy(function(){}, { get: (t, p) => p === 'getContext' ? () => null : (p === 'style' || p === 'classList' || p === 'dataset') ? new Proxy({}, { get: () => () => {}, set: () => true }) : () => el(), set: () => true, apply: () => el() });
globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el(), body: el(), documentElement: el(), activeElement: null, hidden: false };
globalThis.window = globalThis; Object.defineProperty(globalThis, 'navigator', { value: { userAgent: '', onLine: true }, configurable: true });
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {}; globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} }); globalThis.fetch = () => Promise.reject(new Error('stub')); globalThis.lucide = { createIcons() {} };
globalThis.Chart = class { constructor() {} destroy() {} update() {} }; globalThis.XLSX = {}; globalThis.ResizeObserver = class { observe() {} disconnect() {} }; globalThis.MutationObserver = class { observe() {} disconnect() {} };
const mounted = [];
globalThis.Vue = { ref: v => ({ value: v }), computed: fn => ({ get value() { return fn(); }, __c: 1 }), watch() {}, onMounted: fn => mounted.push(fn), onUpdated() {}, nextTick: fn => Promise.resolve().then(fn), provide() {}, inject: () => ({ activeDropdown: { value: '' }, toggleDropdown() {} }),
  createApp: (o) => { const app = { component() { return app; }, mount() { globalThis.__ret = o.setup(); } }; return app; } };
`;
const TAIL = `
const out = {};
const unwrap = (v) => (v && typeof v === 'object' && 'value' in v) ? v.value : v;
for (const [k, v] of Object.entries(globalThis.__ret)) {
    if (typeof v === 'function') { out[k] = '[fn]'; continue; }
    try { out[k] = JSON.parse(JSON.stringify(unwrap(v) ?? null, (kk, x) => (typeof x === 'function' ? '[fn]' : x))); } catch (e) { out[k] = '[err ' + e.message + ']'; }
}
process.stdout.write('@@JSON@@' + JSON.stringify(out));
process.exit(0);
`;
const run = (root) => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const js = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
    fs.writeFileSync(path.join(root, '.eq-stubs.mjs'), HEAD);
    fs.writeFileSync(path.join(root, '.eq-main.mjs'), "import './.eq-stubs.mjs';\n" + js + TAIL);
    const r = spawnSync(process.execPath, [path.join(root, '.eq-main.mjs')], { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26 });
    fs.rmSync(path.join(root, '.eq-stubs.mjs'), { force: true }); fs.rmSync(path.join(root, '.eq-main.mjs'), { force: true });
    const m = r.stdout.split('@@JSON@@')[1];
    if (!m) { console.error(r.stderr.slice(0, 800)); throw new Error('執行失敗：' + root); }
    return JSON.parse(m);
};
const A = run(path.resolve(oldRoot)), B = run(path.resolve(newRoot));
const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort();
let diff = 0, same = 0, nonTrivial = 0;
for (const k of keys) {
    const a = JSON.stringify(A[k]), b = JSON.stringify(B[k]);
    if (a === b) { same++; if (a && a !== 'null' && a !== '[]' && a !== '""' && a !== '0' && a !== 'false' && a !== '{}') nonTrivial++; }
    else { diff++; console.log('❌ 不同：', k, '\n   舊：', String(a).slice(0, 160), '\n   新：', String(b).slice(0, 160)); }
}
console.log(`比對 ${keys.length} 個成員：${same} 個相同（其中 ${nonTrivial} 個有實際內容），${diff} 個不同`);
if (diff) process.exit(1);
