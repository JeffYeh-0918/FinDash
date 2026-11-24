// FinDash 功能模組：導覽（桌機／平板＝左側邊欄，手機＝底部導覽列）
// 由 index.html 的 setup() 呼叫；ctx 是共用環境（前面模組已提供的成員）。
import { NAV_TABS, isNavWide, nextNavPref, navTabIndex } from '../logic/nav.js';

const { ref, computed, watch, nextTick, onMounted } = Vue;
const KEY = 'findash.navPref';

export const useNav = (ctx) => {
    const { activeTab, closeAllDropdowns } = ctx;

    // 側邊欄偏好（'' 自動｜'wide' 展開｜'mini' 窄欄），記在這台裝置的瀏覽器
    let saved = '';
    try { saved = localStorage.getItem(KEY) || ''; } catch (e) { /* 無痕模式等：忽略 */ }
    const navPref = ref(saved === 'wide' || saved === 'mini' ? saved : '');
    const viewportW = ref((typeof window !== 'undefined' && window.innerWidth) || 1280);
    onMounted(() => window.addEventListener('resize', () => { viewportW.value = window.innerWidth; }));

    const navWide = computed(() => isNavWide(navPref.value, viewportW.value));
    const toggleNavPref = () => {
        navPref.value = nextNavPref(navWide.value);
        try { localStorage.setItem(KEY, navPref.value); } catch (e) { /* 忽略 */ }
    };

    const activeTabIndex = computed(() => navTabIndex(activeTab.value));
    const activeTabInfo = computed(() => NAV_TABS[activeTabIndex.value]);
    const setTab = (key) => { closeAllDropdowns(); activeTab.value = key; };

    // 切換分頁：新顯示的那一頁淡入並上移（動畫在 app.css 的 .fd-tab-in；只動透明度與位移）
    watch(activeTab, () => nextTick(() => {
        const el = document.querySelector('[data-fd-tab="' + activeTab.value + '"]');
        if (!el) return;
        el.classList.remove('fd-tab-in');
        void el.offsetWidth;   // 讓瀏覽器重新計算，動畫才會重播
        el.classList.add('fd-tab-in');
    }));

    return { navWide, toggleNavPref, activeTabIndex, activeTabInfo, setTab };
};
