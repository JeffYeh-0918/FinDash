// 亮色主題的資料色：設定裡存的類別色是為深色底挑的鮮艷色（跨裝置同步、不改存檔）；
// 亮色（奶油底）改用大地色系對應色顯示。深色不變。
export const LIGHT_HEX = {
    '#6366f1': '#5b8db8', '#10b981': '#8fa83f', '#06b6d4': '#3fa08f', '#a855f7': '#a0689e', '#ef4444': '#d0553f',
    '#84cc16': '#a9b83a', '#f97316': '#e0813a', '#f59e0b': '#e0a030', '#ec4899': '#d4768c', '#3b82f6': '#4a7fb0',
    '#14b8a6': '#3c9a8e', '#64748b': '#a08a70', '#8b5cf6': '#8f6bb0', '#eab308': '#d6a82a', '#22c55e': '#7fae4e',
    '#0ea5e9': '#4e9cc4', '#d946ef': '#b86aa8', '#fb923c': '#e8935a', '#a3e635': '#b7c446', '#2dd4bf': '#52ae9e',
    '#94a3b8': '#b09a82', '#f43f5e': '#d4576b',
    // 月收支長條（手機）
    '#818cf8': '#5b8db8', '#fbbf24': '#e0a030', '#34d399': '#8fa83f',
};
const mix = (hex, toward, t) => {
    const a = parseInt(hex.slice(1), 16), b = parseInt(toward.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
    return '#' + [16, 8, 0].map(s => ch(s).toString(16).padStart(2, '0')).join('');
};
// light＝true 時回傳亮色對應色；色票外的自訂色往暖灰褐靠 40%（降低飽和度）
export const themedHex = (hex, light) => {
    if (!light || !/^#[0-9a-fA-F]{6}$/.test(hex || '')) return hex;
    const k = hex.toLowerCase();
    return LIGHT_HEX[k] || mix(k, '#8a7a66', 0.4);
};
// 亮色下「色塊上的線條圖示／文字」要比色塊深，才看得清楚：往咖啡色混 40%
export const inkOf = (hex) => (/^#[0-9a-fA-F]{6}$/.test(hex || '') ? mix(hex.toLowerCase(), '#3b2a1e', 0.4) : hex);
// 目前是不是亮色：優先讀 ctx.themeResolved（Vue ref，讓畫面跟著變），沒有就讀 <html data-theme>
export const isLightTheme = (ctx) => {
    const r = ctx && ctx.themeResolved;
    if (r && typeof r === 'object' && 'value' in r) return r.value === 'light';
    return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
};
