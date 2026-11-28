// FinDash 功能模組：外觀主題（日／夜開關）
// 真正套用主題的是 js/theme-boot.js（在 <head> 同步執行，避免閃爍）；這裡只提供畫面用的狀態與切換。
// 第一次開啟＝跟隨系統；使用者按過開關後就固定成他選的那個（亮色或深色）。
const { ref, computed, onMounted, nextTick } = Vue;

export const useTheme = (ctx) => {
    const boot = (typeof window !== 'undefined' && window.FdTheme) || null;
    const themeResolved = ref(boot ? boot.resolve(boot.read()) : 'dark');
    const themeIsDark = computed(() => themeResolved.value === 'dark');

    // 切換前先暫停全頁面的過渡動畫（避免整頁同時重算顏色時卡頓），開關自己的滑塊動畫不受影響
    const setTheme = (mode) => {
        if (mode !== 'light' && mode !== 'dark') return;
        if (mode === themeResolved.value) return;            // 已經是這個模式：不動作
        const root = typeof document !== 'undefined' ? document.documentElement : null;
        if (root) root.classList.add('fd-theme-swap');
        themeResolved.value = mode;
        if (boot) boot.set(mode);
        if (root) setTimeout(() => root.classList.remove('fd-theme-swap'), 60);
    };
    const toggleTheme = () => setTheme(themeResolved.value === 'dark' ? 'light' : 'dark');
    // 點開關：點軌道左半（太陽）＝亮色、右半（月亮）＝深色，已經是該模式就不動；點文字列或用鍵盤＝切換
    const onThemeClick = (ev) => {
        const track = ev && ev.target && ev.target.closest ? ev.target.closest('.fd-theme-track') : null;
        if (track && ev.clientX !== undefined && ev.detail !== 0) {
            const r = track.getBoundingClientRect();
            return setTheme(ev.clientX < r.left + r.width / 2 ? 'light' : 'dark');
        }
        toggleTheme();
    };
    // 系統主題改變（尚未手動選過）或在別處切換時，同步畫面與圖表
    const onTheme = (ev) => {
        themeResolved.value = (ev && ev.detail) || themeResolved.value;
        // 圖表等開關動畫跑完再重畫（重畫比較吃資源，同時進行會讓滑塊卡頓）
        setTimeout(() => nextTick(() => { if (ctx.renderCharts) ctx.renderCharts(); }), 380);
    };
    onMounted(() => { if (typeof window !== 'undefined') window.addEventListener('fd-theme', onTheme); });

    return { themeResolved, themeIsDark, toggleTheme, onThemeClick };
};
