// FinDash 功能模組：外觀主題（跟隨系統／亮色／深色）
// 真正套用主題的是 js/theme-boot.js（在 <head> 同步執行，避免閃爍）；這裡只提供畫面用的狀態與切換。
const { ref, computed, onMounted, nextTick } = Vue;

export const THEME_OPTIONS = [
    { v: 'system', label: '跟隨系統' },
    { v: 'light', label: '亮色' },
    { v: 'dark', label: '深色' },
];

export const useTheme = (ctx) => {
    const boot = (typeof window !== 'undefined' && window.FdTheme) || null;
    const themePref = ref(boot ? boot.read() : 'dark');
    const themeResolved = ref(boot ? boot.resolve(themePref.value) : 'dark');
    const themeIndex = computed(() => Math.max(0, THEME_OPTIONS.findIndex(o => o.v === themePref.value)));

    const setThemePref = (v) => {
        themePref.value = v;
        if (boot) boot.set(v);
    };
    // 系統主題改變（偏好＝跟隨系統）或在別處切換時，同步畫面與圖表
    const onTheme = (ev) => {
        themeResolved.value = (ev && ev.detail) || (boot ? boot.resolve(themePref.value) : 'dark');
        nextTick(() => { if (ctx.renderCharts) ctx.renderCharts(); });
    };
    onMounted(() => { if (typeof window !== 'undefined') window.addEventListener('fd-theme', onTheme); });

    return { THEME_OPTIONS, themePref, themeResolved, themeIndex, setThemePref };
};
