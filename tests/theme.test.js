import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { REVERSE, triplet, eachColor, canon } from '../tools/theme_lib.mjs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const html = read('index.html'), app = read('css/app.css'), tw = read('css/tailwind.css'), map = read('css/theme-map.css');

// ---- 小工具：解析「.class{decl;decl}」（含一層 @media） ----
const rulesOf = (css) => {
    const out = new Map(); let at = ''; css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/(@media[^{]+\{)|([^{}]+)\{([^{}]*)\}|(\})/g)) {
        if (m[1]) at = m[1]; else if (m[4]) at = ''; else out.set(at + '|' + m[2].trim(), m[3]);
    }
    return out;
};
const declMap = (body) => Object.fromEntries(body.split(';').filter(Boolean).map(d => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; }));
const darkResolve = (v) => v.replace(/rgb\(var\(--[ct]-([a-z]+-\d+|fg|hoverfg)\)\/([^)]+(?:\([^)]*\))?[^)]*)\)/g, (s, n, a) => {
    const t = n === 'hoverfg' ? '255 255 255' : triplet(n); const [r, g, b] = t.split(' '); return `rgba(${r},${g},${b},${a})`;
}).replace(/rgb\(var\(--[ct]-([a-z]+-\d+|fg|hoverfg)\)\)/g, (s, n) => { const [r, g, b] = (n === 'hoverfg' ? '255 255 255' : triplet(n)).split(' '); return `rgba(${r},${g},${b},1)`; });
const normTw = (v) => v.replace(/rgb\((\d+) (\d+) (\d+)\/(var\([^)]*\)|[\d.]+)\)/g, (s, r, g, b, a) => `rgba(${r},${g},${b},${a})`)
    .replace(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g, (s, r, g, b, a) => `rgba(${r},${g},${b},${Number(a)})`)
    .replace(/#([0-9a-f]{6})\b/gi, (s, h) => `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},1)`)
    .replace(/rgb\((\d+) (\d+) (\d+)\)/g, (s, r, g, b) => `rgba(${r},${g},${b},1)`);

test('V27 theme-map.css：每條規則在「深色」代入後，與 tailwind.css 原本的宣告完全相同（深色外觀不變）', () => {
    const orig = rulesOf(tw), over = rulesOf(map);
    assert.ok(over.size > 100, '映射規則太少：' + over.size);
    let checked = 0;
    for (const [key, body] of over) {
        const o = orig.get(key);
        assert.ok(o !== undefined, '原始 tailwind.css 沒有這條規則：' + key);
        const od = declMap(o);
        for (const [k, v] of Object.entries(declMap(body))) {
            if (v.includes('--t-hoverfg')) continue;            // hover 白字（深色＝白）另測
            assert.equal(normTw(darkResolve(v)), normTw(od[k]), `${key} ${k}`);
            checked++;
        }
    }
    assert.ok(checked > 100);
});
test('V27 theme-map.css：tailwind.css 裡所有用到調色盤的顏色規則都有被映射（沒有漏網之魚）', () => {
    const over = rulesOf(map); const missing = [];
    for (const [key, body] of rulesOf(tw)) {
        if (key.includes('|.') === false && !key.startsWith('|')) { /* @media 內也要檢查 */ }
        const hits = [...body.matchAll(/rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/g)].filter(m => !(m[1] === '255' && m[2] === '255' && m[3] === '255') && REVERSE.has(`${m[1]},${m[2]},${m[3]}`));
        const hasProp = /(^|;)(color|background-color|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color|--tw-gradient-from|--tw-gradient-to|--tw-ring-color):/.test(body);
        if (hits.length && hasProp && !over.has(key) && !/^\|?\*|:before|:after|backdrop/.test(key)) missing.push(key);
    }
    assert.deepEqual(missing, []);
});
test('V27 色票：app.css 用到的每個 --c-*／--t-* 都在深色 :root 定義過；亮色也覆寫了整條灰階', () => {
    const used = new Set([...app.matchAll(/var\(--([ct]-[a-z]+-\d+|c-fg|t-hoverfg)\)/g)].map(m => m[1]));
    for (const m of map.matchAll(/var\(--([ct]-[a-z]+-\d+|t-hoverfg)\)/g)) used.add(m[1]);
    for (const m of html.matchAll(/var\(--([ct]-[a-z]+-\d+)\)/g)) used.add(m[1]);
    const root = app.match(/:root \{([\s\S]*?)\n\}/)[1], light = app.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1];
    const missing = [...used].filter(n => !new RegExp('--' + n + ':').test(root));
    assert.deepEqual(missing, [], '深色 :root 沒定義的色票');
    const slate = [...used].filter(n => /^[ct]-slate-/.test(n));
    const miss2 = slate.filter(n => !new RegExp('--' + n + ':').test(light));
    assert.deepEqual(miss2, [], '亮色沒有覆寫的灰階色票（亮色會顯示成深色版的顏色）');
    for (const n of ['--gain', '--loss', '--focus']) assert.ok(new RegExp(n + ':').test(light), '亮色缺 ' + n);
});
test('V27 app.css：不再有調色盤色碼寫死（#fff、純黑陰影、--gain／--loss 的預設值除外）', () => {
    const body = app.replace(/\/\* THEME-TOKENS:BEGIN[\s\S]*?THEME-TOKENS:END \*\//, '');
    const bad = [];
    eachColor(body, (s, c) => {
        if (c.r === 255 && c.g === 255 && c.b === 255 && c.a === 1) return s;
        if (c.r === 0 && c.g === 0 && c.b === 0) return s;
        if (REVERSE.has(`${c.r},${c.g},${c.b}`) && !/^#(ff6b7a|34d399)$/i.test(s)) bad.push(s);
        return s;
    });
    assert.deepEqual(bad, [], '還有寫死的調色盤色碼，請改用 rgb(var(--c-…))／rgb(var(--t-…))');
});
// ---- 對比：亮色文字色在亮色底色上 ≥ 4.5:1 ----
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const lightVal = (n) => { const m = app.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1].match(new RegExp('--' + n + ': (\\d+) (\\d+) (\\d+);')); assert.ok(m, n); return [+m[1], +m[2], +m[3]]; };
test('V27 亮色對比：灰階與強調色文字在奶油底（slate-900／950）與卡片（slate-850）上 ≥ 4.5:1', () => {
    const bgs = ['c-slate-900', 'c-slate-950', 'c-slate-850'].map(lightVal);
    const texts = ['t-slate-500', 't-slate-100', 't-slate-200', 't-slate-300', 't-slate-400', 't-emerald-400', 't-rose-400', 't-indigo-400', 't-amber-400', 't-sky-400', 't-teal-400', 't-emerald-300', 't-rose-300', 't-indigo-300', 't-amber-300', 't-sky-300'];
    const low = [];
    for (const t of texts) { if (!new RegExp('--' + t + ':').test(app.match(/:root\[data-theme="light"\] \{([\s\S]*?)\n\}/)[1])) continue; for (const b of bgs) { const r = ratio(lightVal(t), b); if (r < 4.5) low.push(`${t} ${r.toFixed(2)}`); } }
    assert.deepEqual(low, []);
});
// ---- 啟動腳本（在假瀏覽器環境執行）----
const boot = (store, prefersLight) => {
    const listeners = {}; const attrs = {}; let metaContent = '';
    const meta = { set content(v) { metaContent = v; }, get content() { return metaContent; } };
    const win = {
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
        matchMedia: () => ({ matches: prefersLight, addEventListener: (e, f) => { listeners[e] = f; } }),
        dispatchEvent: (e) => { (win._ev = win._ev || []).push(e.detail); }, CustomEvent: class { constructor(n, o) { this.detail = o.detail; } },
    };
    const doc = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, classList: { toggle: (c, on) => { attrs['class:' + c] = on; } } }, querySelector: () => meta, createElement: () => meta, head: { appendChild() {} } };
    const ctx = { window: win, document: doc, localStorage: win.localStorage, matchMedia: win.matchMedia, CustomEvent: win.CustomEvent };
    vm.runInNewContext(read('js/theme-boot.js'), ctx);
    return { win, attrs, meta: () => metaContent, listeners, FdTheme: win.FdTheme };
};
test('V27 theme-boot：預設深色；偏好 light／dark／system 正確解析並寫入 data-theme 與 theme-color', () => {
    let b = boot({}, true);
    assert.equal(b.FdTheme.DEFAULT, 'dark');                       // 亮色各畫面實機檢查完才改成 'system'
    assert.equal(b.attrs['data-theme'], 'dark'); assert.equal(b.meta(), '#0f172a');
    b = boot({ 'findash.theme': 'light' }, false); assert.equal(b.attrs['data-theme'], 'light'); assert.equal(b.meta(), '#faf3e6'); assert.equal(b.attrs['class:dark'], false);
    b = boot({ 'findash.theme': 'system' }, true); assert.equal(b.attrs['data-theme'], 'light');
    b = boot({ 'findash.theme': 'system' }, false); assert.equal(b.attrs['data-theme'], 'dark');
    b = boot({ 'findash.theme': '亂寫' }, true); assert.equal(b.attrs['data-theme'], 'dark');          // 壞值退回預設
});
test('V27 theme-boot：set() 會存檔、套用並通知；跟隨系統時系統主題改變會通知', () => {
    const store = {}; const b = boot(store, false);
    b.FdTheme.set('light');
    assert.equal(store['findash.theme'], 'light'); assert.equal(b.attrs['data-theme'], 'light'); assert.deepEqual(b.win._ev, ['light']);
    b.FdTheme.set('system'); assert.equal(b.attrs['data-theme'], 'dark');
    b.listeners.change(); assert.equal(b.win._ev.length, 3);
});
test('V27 接線：啟動腳本在 CSS 之前、theme-map 在 tailwind 與 app.css 之間、外觀切換元件與模組都已接上', () => {
    const i = (s) => html.indexOf(s);
    assert.ok(i('js/theme-boot.js') > 0 && i('js/theme-boot.js') < i('css/tailwind.css'), '啟動腳本要在 CSS 之前');
    assert.ok(i('css/tailwind.css') < i('css/theme-map.css') && i('css/theme-map.css') < i('css/app.css'), '載入順序：tailwind → theme-map → app');
    assert.match(html, /"\.\/js\/features\/theme\.js": "\.\/js\/features\/theme\.js\?v=\d+"/);
    assert.match(html, /Object\.assign\(ctx, useTheme\(ctx\)\)/);
    for (const m of ['THEME_OPTIONS', 'themePref', 'themeIndex', 'setThemePref']) assert.ok(html.includes(`'${m}'`), m + ' 不在 TEMPLATE_MEMBERS');
    assert.equal((html.match(/aria-label="外觀主題"/g) || []).length, 2);
});
