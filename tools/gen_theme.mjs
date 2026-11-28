// 用法：
//   node tools/gen_theme.mjs map       由 css/tailwind.css 產生 css/theme-map.css（重編 Tailwind 後要重跑）
//   node tools/gen_theme.mjs migrate   一次性：把 app.css／index.html／部分 JS 的色碼換成 token（已遷移過再跑不會變）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eachColor, tokenize, normalizeAll, resolveDark, triplet } from './theme_lib.mjs';

const P = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const mode = process.argv[2];

// ---- 解析壓縮過的 CSS：回傳 [{ at, sel, body }]（只處理一層 @media） ----
const parseRules = (css) => {
    const out = []; let i = 0;
    const readBlock = (at) => {
        while (i < css.length) {
            const open = css.indexOf('{', i); if (open < 0) break;
            const head = css.slice(i, open).trim();
            if (head.startsWith('@media') || head.startsWith('@supports')) {
                i = open + 1; readBlock(head);
                continue;
            }
            // 讀到對應的 }（宣告值裡可能有 url(...)，但 tailwind.css 沒有大括號巢狀）
            const close = css.indexOf('}', open);
            const body = css.slice(open + 1, close);
            out.push({ at, sel: head, body });
            i = close + 1;
            if (at && css[i] === '}') { i++; return; }
            if (!at) continue;
        }
    };
    readBlock(null);
    return out;
};

const splitDecls = (body) => body.split(';').map(s => s.trim()).filter(Boolean).map(s => { const k = s.indexOf(':'); return [s.slice(0, k).trim(), s.slice(k + 1).trim()]; });
const TEXT_PROPS = new Set(['color', 'caret-color', 'text-decoration-color']);

if (mode === 'map') {
    const src = readFileSync(P('css/tailwind.css'), 'utf8');
    const rules = parseRules(src);
    const outPlain = [], outAt = new Map();
    let n = 0;
    for (const r of rules) {
        if (r.sel.startsWith('@')) continue;
        const decls = splitDecls(r.body); const changed = [];
        for (const [k, v] of decls) {
            if (k.startsWith('--tw-') && !/^--tw-(gradient-(from|to|via|stops)|ring-color|shadow-color|shadow-colored)$/.test(k) && !/^--tw-(border|bg|text|divide)-/.test(k)) { /* 其他 --tw-* 不處理 */ }
            const family = TEXT_PROPS.has(k) ? 't' : 'c';
            let nv = v;
            // hover 白字：亮色主題要變深
            if (k === 'color' && /hover/.test(r.sel) && /^(#fff(fff)?|rgb\(255 255 255)/.test(v)) {
                nv = v.replace(/^#fff(fff)?/, 'rgb(var(--t-hoverfg))').replace(/^rgb\(255 255 255/, 'rgb(var(--t-hoverfg)');
            } else {
                // Tailwind 3 的寫法：rgb(R G B/var(--tw-xxx-opacity,1))
                nv = v.replace(/rgb\((\d+) (\d+) (\d+)\/var\((--tw-[a-z-]+),1\)\)/g, (s, r, g, b, vr) => {
                    if (+r === 255 && +g === 255 && +b === 255) return s;
                    const t = tokenize({ r: +r, g: +g, b: +b, a: 1 }, family);
                    return t === null ? s : t.replace(/\)$/, '') + '/var(' + vr + ',1))';
                });
                nv = eachColor(nv, (s, c) => {
                    if (c.a === 1 && c.r === 255 && c.g === 255 && c.b === 255) return s;   // 白字（按鈕上）維持白
                    const t = tokenize(c, family);
                    return t === null ? s : t;
                });
            }
            if (nv !== v) changed.push(`${k}:${nv}`);
        }
        if (!changed.length) continue;
        n++;
        const line = `${r.sel}{${changed.join(';')}}`;
        if (r.at) { if (!outAt.has(r.at)) outAt.set(r.at, []); outAt.get(r.at).push(line); } else outPlain.push(line);
    }
    // tailwind 輸出的 rgb(r g b/α) 沒空白的寫法，token 版本要產生合法的 rgb(var(--x)/α)
    let css = '/* 由 tools/gen_theme.mjs map 自動產生，請勿手改。重編 tailwind.css 後重跑：node tools/gen_theme.mjs map */\n' + outPlain.join('\n') + '\n';
    for (const [at, lines] of outAt) css += `${at}{\n${lines.join('\n')}\n}\n`;
    css = css.replace(/rgb\((var\(--[ct]-[a-z0-9-]+\)) \/ ([\d.]+)\)/g, 'rgb($1/$2)');
    writeFileSync(P('css/theme-map.css'), css);
    console.log(`theme-map.css：${n} 條規則`);
}

if (mode === 'migrate') {
    const props = (text, family) => text;
    // app.css：逐宣告處理（屬性決定家族）
    const migrateCss = (css) => css.replace(/([a-zA-Z-]+)(\s*:\s*)([^;{}]*)/g, (all, prop, sep, val) => {
        if (!/#[0-9a-fA-F]{3}|rgba?\(/.test(val)) return all;
        if (prop.startsWith('--') && !/^--(fdm-accent-bg|seg-accent)/.test(prop)) return all;   // 自訂屬性（--a、--gain…）另外手動處理
        const family = TEXT_PROPS.has(prop) ? 't' : 'c';
        const nv = eachColor(val, (s, c) => {
            if (c.r === 255 && c.g === 255 && c.b === 255 && c.a === 1) return s;
            if (c.r === 0 && c.g === 0 && c.b === 0) return s;              // 純黑陰影維持
            const t = tokenize(c, family); return t === null ? s : t;
        });
        return prop + sep + nv;
    });
    const css0 = readFileSync(P('css/app.css'), 'utf8');
    const css1 = migrateCss(css0);
    writeFileSync(P('css/app.css'), css1);
    console.log('app.css 已遷移；深色等價檢查：', normalizeAll(resolveDark(css1)) === normalizeAll(css0) ? '一致' : '不一致！');

    // index.html 與 JS 內的 style 色碼（只處理含 color／background／border 的行內樣式字串）
    for (const f of ['index.html', 'js/features/mobile-cards.js', 'js/features/ledger-view.js']) {
        const t0 = readFileSync(P(f), 'utf8');
        const t1 = t0.replace(/(color|background|borderColor|border-color|background-color)(\s*:\s*['"]?)(#[0-9a-fA-F]{6}\b|rgba?\([^)]*\))/g, (all, prop, sep, col) => {
            const c = eachColor(col, (s, cc) => s); // 取得字串
            const parsed = eachColor(col, (s, cc) => { const t = tokenize(cc, /^color$/i.test(prop) ? 't' : 'c'); return t === null ? s : t; });
            return prop + sep + parsed;
        });
        if (t1 !== t0) writeFileSync(P(f), t1);
        console.log(f, t1 === t0 ? '無變動' : '已遷移');
    }
}

// ---- tokens：依實際用到的名稱，產生 app.css 最前面的「色票」區塊（深色＝現行外觀；亮色＝奶油暖色） ----
if (mode === 'tokens') {
    const used = new Set();
    for (const f of ['css/app.css', 'css/theme-map.css', 'index.html']) {
        for (const m of readFileSync(P(f), 'utf8').matchAll(/--([ct])-([a-z]+-\d+|fg|hoverfg)\b/g)) used.add(m[1] + '-' + m[2]);
    }
    ['c-slate-840', 'c-slate-850', 'c-slate-800', 't-slate-100', 't-slate-400'].forEach(x => used.add(x));   // 語意 token 會用到
    const dark = [], light = [];
    const LIGHT_SLATE = { 50: '60 42 30', 100: '74 52 38', 200: '86 64 48', 300: '106 86 68', 400: '138 117 96', 500: '160 142 118', 600: '201 184 154', 700: '224 210 184', 800: '237 226 207', 825: '244 236 220', 840: '252 247 236', 850: '250 244 232', 875: '243 234 218', 900: '246 238 224', 950: '252 247 236', 975: '235 223 201' };
    const LIGHT_T = {   // 亮色的文字色：比暗色版更深，奶油底上對比 ≥ 4.5:1
        'slate-400': '120 100 80', 'slate-500': '124 104 82',
        'amber-200': '120 53 15',
        'emerald-200': '28 90 36', 'emerald-300': '34 110 44', 'emerald-400': '38 122 50', 'emerald-500': '38 122 50',
        'rose-200': '120 28 20', 'rose-300': '160 36 26', 'rose-400': '186 44 32', 'rose-500': '186 44 32',
        'indigo-200': '24 70 90', 'indigo-300': '31 86 108', 'indigo-400': '40 105 131', 'indigo-500': '40 105 131',
        'amber-300': '120 53 15', 'amber-400': '146 64 14', 'amber-500': '146 64 14',
        'sky-200': '110 44 22', 'sky-300': '138 58 30', 'sky-400': '169 73 42',   // 亮色只有一個強調色：天藍（信用卡頁）也統一成陶土橘
        'teal-300': '17 94 89', 'teal-400': '15 118 110',
    };
    const LIGHT_C = {   // 淡底色換成淺色；實心按鈕色換成暖色系：emerald-700/800＝陶土橘（主按鈕、手機＋鈕），indigo-500/600＝石板藍（記股票鈕）
        'indigo-950': '225 238 244', 'indigo-800': '160 195 210', 'indigo-600': '40 105 131', 'indigo-500': '31 86 108', 'indigo-400': '60 120 145',
        'emerald-700': '180 83 47', 'emerald-800': '154 66 36',
        'sky-400': '200 110 76', 'sky-500': '192 100 66', 'sky-600': '154 66 36', 'sky-700': '180 83 47',
        'emerald-400': '120 150 80', 'emerald-500': '98 130 62', 'emerald-600': '78 110 50',   // 語意綠（收入、賣出、tint）＝苔綠
        'rose-400': '190 95 70', 'rose-500': '170 70 48', 'rose-600': '150 58 38',            // 語意紅（支出、買進、刪除）＝磚紅
    };   // 淡底色：亮色要換成淺色
    [...used].sort().forEach((u) => {
        const [fam, ...rest] = u.split('-'); const name = rest.join('-');
        if (name === 'fg') { dark.push(`--${u}: 255 255 255;`); light.push(`--${u}: 74 52 38;`); return; }
        if (name === 'hoverfg') { dark.push(`--${u}: 255 255 255;`); light.push(`--${u}: 60 42 30;`); return; }
        dark.push(`--${u}: ${triplet(name)};`);
        if (fam === 't' && LIGHT_T[name]) light.push(`--${u}: ${LIGHT_T[name]};`);
        else if (name.startsWith('slate-')) light.push(`--${u}: ${LIGHT_SLATE[name.slice(6)]};`);
        else if (fam === 't' && LIGHT_T[name]) light.push(`--${u}: ${LIGHT_T[name]};`);
        else if (fam === 'c' && LIGHT_C[name]) light.push(`--${u}: ${LIGHT_C[name]};`);
    });
    const wrap = (arr) => arr.reduce((acc, d) => { const last = acc[acc.length - 1]; if (last && last.length + d.length < 150) acc[acc.length - 1] += ' ' + d; else acc.push('    ' + d); return acc; }, []).join('\n');
    const block = `/* THEME-TOKENS:BEGIN（由 node tools/gen_theme.mjs tokens 產生；色票三元組＝R G B，用法：rgb(var(--c-slate-900) / .6)）
   --c-*＝底色／邊線／光暈等填色；--t-*＝文字色（亮色主題比填色更深，才讀得到）。深色＝V26 現行外觀（等值轉換）。 */
:root {
${wrap(dark)}
    color-scheme: dark;
    /* 語意 token（新樣式請用這些，不要再寫色碼） */
    --bg: rgb(var(--c-slate-900)); --surface: rgb(var(--c-slate-850)); --surface-2: rgb(var(--c-slate-800)); --border: rgb(var(--c-slate-700));
    --text: rgb(var(--t-slate-100)); --text-muted: rgb(var(--t-slate-400));
    --accent: #a5b4fc; --accent-text: #a5b4fc; --on-accent: #0e1118;
    --warn: rgb(var(--t-amber-400));
}
:root[data-theme="light"] {
${wrap(light)}
    color-scheme: light;
    --accent: #b4532f; --accent-text: #a9492a; --on-accent: #fff;
    --gain: #c23a2e; --loss: #2e7d3a; --flat: rgb(var(--t-slate-400)); --focus: #2e7d3a;
}
/* THEME-TOKENS:END */
`;
    let css = readFileSync(P('css/app.css'), 'utf8');
    if (css.includes('/* THEME-TOKENS:BEGIN')) css = css.replace(/\/\* THEME-TOKENS:BEGIN[\s\S]*?THEME-TOKENS:END \*\/\n/, block);
    else css = css.replace('[v-cloak] { display: none !important; }\n', '[v-cloak] { display: none !important; }\n' + block);
    writeFileSync(P('css/app.css'), css);
    console.log('tokens：dark', dark.length, 'light', light.length);
}
