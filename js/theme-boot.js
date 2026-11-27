// FinDash 主題啟動（經典 script，放在 <head> 最前面、CSS 之前同步執行 → 第一次繪製就是正確主題，不閃白／閃黑）
// 偏好：'system'（跟隨系統）｜'light'｜'dark'，記在這台裝置的 localStorage（findash.theme）。
// 亮色各畫面完成實機檢查前，預設先用深色；檢查完把 DEFAULT 改成 'system' 即可（使用者已拍板最終預設＝跟隨系統）。
(function () {
    var KEY = 'findash.theme', DEFAULT = 'dark';
    var COLORS = { dark: '#0f172a', light: '#faf3e6' };     // <meta name="theme-color">（手機網址列／PWA 標題列）
    var mq = (typeof matchMedia === 'function') ? matchMedia('(prefers-color-scheme: light)') : null;
    function valid(v) { return v === 'system' || v === 'light' || v === 'dark'; }
    function read() { try { var v = localStorage.getItem(KEY); return valid(v) ? v : DEFAULT; } catch (e) { return DEFAULT; } }
    function resolve(pref) { return pref === 'system' ? ((mq && mq.matches) ? 'light' : 'dark') : (pref === 'light' ? 'light' : 'dark'); }
    function apply(pref) {
        var t = resolve(pref), root = document.documentElement;
        root.setAttribute('data-theme', t);
        root.classList.toggle('dark', t === 'dark');
        var m = document.querySelector('meta[name="theme-color"]');
        if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
        m.content = COLORS[t];
        return t;
    }
    function notify(t) { try { window.dispatchEvent(new CustomEvent('fd-theme', { detail: t })); } catch (e) { /* 忽略 */ } }
    function set(pref) {
        if (!valid(pref)) pref = DEFAULT;
        try { localStorage.setItem(KEY, pref); } catch (e) { /* 無痕模式：只在本次有效 */ }
        notify(apply(pref));
    }
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (read() === 'system') notify(apply('system')); });
    window.FdTheme = { KEY: KEY, DEFAULT: DEFAULT, COLORS: COLORS, read: read, resolve: resolve, apply: apply, set: set };
    apply(read());
})();
