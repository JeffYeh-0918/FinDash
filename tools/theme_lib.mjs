// V27 主題工具共用函式：調色盤、色碼辨識、正規化（用來證明「深色外觀完全不變」）
// 色票家族：--c-*（底色、邊線、光暈等「填色」）、--t-*（文字色；亮色主題要比填色更深才讀得到）

export const SLATE = { 50: 'f8fafc', 100: 'f1f5f9', 200: 'e2e8f0', 300: 'cbd5e1', 400: '94a3b8', 500: '64748b', 600: '475569', 700: '334155', 800: '1e293b', 850: '131e32', 900: '0f172a', 950: '020617' };
// 專案自訂的深色底（非 Tailwind 標準色）：命名成 slate 的中間值
export const SLATE_EXTRA = { 825: '18233a', 840: '1b2336', 875: '131c2e', 975: '0b1220' };
export const HUES = {
    emerald: { 200: 'a7f3d0', 300: '6ee7b7', 400: '34d399', 500: '10b981', 600: '059669', 700: '047857', 800: '065f46', 900: '064e3b', 950: '022c22' },
    rose: { 200: 'fecdd3', 300: 'fda4af', 400: 'fb7185', 500: 'f43f5e', 600: 'e11d48', 700: 'be123c', 800: '9f1239', 900: '881337' },
    indigo: { 200: 'c7d2fe', 300: 'a5b4fc', 400: '818cf8', 500: '6366f1', 600: '4f46e5', 700: '4338ca', 800: '3730a3', 900: '312e81', 950: '1e1b4b' },
    amber: { 300: 'fcd34d', 400: 'fbbf24', 500: 'f59e0b', 600: 'd97706', 700: 'b45309', 800: '92400e', 900: '78350f' },
    sky: { 200: 'bae6fd', 300: '7dd3fc', 400: '38bdf8', 500: '0ea5e9', 600: '0284c7', 700: '0369a1', 800: '075985', 900: '0c4a6e' },
    teal: { 200: '99f6e4', 300: '5eead4', 400: '2dd4bf', 500: '14b8a6', 700: '0f766e', 800: '115e59' },
};
// 對應表：'r,g,b' → 名稱（例：'15,23,42' → 'slate-900'）
export const REVERSE = new Map();
const hexToRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
export const rgbKey = (r, g, b) => `${r},${g},${b}`;
const add = (name, hex) => { const k = rgbKey(...hexToRgb(hex)); if (!REVERSE.has(k)) REVERSE.set(k, name); };
Object.entries(SLATE).forEach(([s, h]) => add(`slate-${s}`, h));
Object.entries(SLATE_EXTRA).forEach(([s, h]) => add(`slate-${s}`, h));
Object.entries(HUES).forEach(([hue, m]) => Object.entries(m).forEach(([s, h]) => add(`${hue}-${s}`, h)));
// 白色（半透明白的玻璃邊線）：深色＝白、亮色＝深棕，所以叫 fg
REVERSE.set('255,255,255', 'fg');

export const triplet = (name) => {
    for (const [k, v] of REVERSE) if (v === name) return k.split(',').join(' ');
    throw new Error('未知色名 ' + name);
};

// 辨識一段文字裡的色碼：#rgb／#rrggbb／rgb()／rgba()
const COLOR_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+(?:\s*[,/]\s*[\d.]+%?)?\s*\)/g;
export const parseColor = (s) => {
    if (s[0] === '#') { const [r, g, b] = hexToRgb(s); return { r, g, b, a: 1 }; }
    const m = s.match(/\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)/);
    let a = m[4] === undefined ? 1 : Number(m[4]); if (m[5] === '%') a /= 100;
    return { r: +m[1], g: +m[2], b: +m[3], a };
};
export const eachColor = (text, fn) => text.replace(COLOR_RE, (s) => fn(s, parseColor(s)));
const fmtA = (a) => String(Number(a.toFixed(4)));
export const canon = ({ r, g, b, a }) => `rgba(${r},${g},${b},${fmtA(a)})`;

// 把一個顏色換成 token 寫法；找不到對應（例如純黑陰影、#fff）就回 null＝保持原樣
export const tokenize = (c, family) => {
    const name = REVERSE.get(rgbKey(c.r, c.g, c.b));
    if (!name) return null;
    const v = `var(--${family}-${name})`;
    return c.a === 1 ? `rgb(${v})` : `rgb(${v} / ${fmtA(c.a)})`;
};

// 把 CSS 文字裡的 var(--c-xxx)／var(--t-xxx) 依「深色」代入，再把所有顏色正規化；兩份 CSS 正規化後相同＝外觀相同
export const resolveDark = (css) => {
    const tri = (n) => triplet(n);
    css = css.replace(/rgb\(\s*var\(--[ct]-([a-z]+-\d+|fg)\)\s*(?:\/\s*([^)]+?)\s*)?\)/g, (s, name, alpha) => {
        const [r, g, b] = tri(name).split(' ');
        return alpha === undefined ? `rgba(${r},${g},${b},1)` : `rgba(${r},${g},${b},${alpha})`;
    });
    return css;
};
export const normalizeAll = (css) => eachColor(css, (s, c) => canon(c)).replace(/rgba\((\d+),(\d+),(\d+),([\d.]+)\)/g, (s, r, g, b, a) => `rgba(${r},${g},${b},${fmtA(Number(a))})`);
