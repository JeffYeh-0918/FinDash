// FinDash 功能模組：動態回饋（內容更新時重播過渡、大數字滾動）
// 只動 opacity／transform；系統設為「減少動態」時，數字直接換成新值、位移改成單純淡入（CSS 處理）。
const { ref, watch, nextTick, onBeforeUnmount } = Vue;

const prefersReduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmtNTD = (v) => 'NT$ ' + Math.round(v || 0).toLocaleString('zh-TW');

// <fd-num :value="數字"></fd-num>：數字變動時，從舊值滾到新值（約 0.4 秒）；格式與 formatCurrency 相同
export const FdNum = {
    props: { value: { type: Number, default: 0 } },
    setup(props) {
        const shown = ref(props.value || 0);
        let raf = 0;
        watch(() => props.value, (to) => {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
            const from = shown.value, target = to || 0;
            if (prefersReduce() || typeof requestAnimationFrame !== 'function' || Math.abs(target - from) < 1) { shown.value = target; return; }
            let t0 = null; const D = 400;
            const step = (t) => {
                if (t0 === null) t0 = t;   // 以第一個動畫幀的時間為起點
                const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
                shown.value = p < 1 ? from + (target - from) * e : target;
                if (p < 1) raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
        });
        if (onBeforeUnmount) onBeforeUnmount(() => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf); });
        return { shown, fmtNTD };
    },
    template: '<span>{{ fmtNTD(shown) }}</span>'
};

const ANIM = ['fd-tab-in', 'fd-slide-l', 'fd-slide-r'];
// 重播指定元素的淡入（dir：'l' 從左滑入、'r' 從右滑入、空＝淡入上移）；看不見的元素（display:none）略過
export const replayIn = (sel, dir) => nextTick(() => {
    document.querySelectorAll(sel).forEach(el => {
        if (el.offsetParent === null) return;
        ANIM.forEach(c => el.classList.remove(c));
        void el.offsetWidth;   // 讓瀏覽器重新計算，動畫才會重播
        el.classList.add(dir === 'l' ? 'fd-slide-l' : dir === 'r' ? 'fd-slide-r' : 'fd-tab-in');
    });
});

export const useMotion = (ctx) => {
    // 液態切換：點膠囊式切換按鈕時，記下移動方向並重播滑塊的伸長動畫（滑塊位置由範本的 --i 控制）
    if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('click', (ev) => {
            const btn = ev.target && ev.target.closest ? ev.target.closest('.fd-seg2 > button') : null;
            if (!btn || prefersReduce()) return;
            const box = btn.parentElement;
            const kids = Array.prototype.filter.call(box.children, el => el.tagName === 'BUTTON');
            const to = kids.indexOf(btn), from = parseFloat(box.style.getPropertyValue('--i'));
            if (to < 0 || isNaN(from) || to === from) return;
            box.setAttribute('data-dir', to > from ? 'r' : 'l');
            box.classList.remove('is-liquid'); void box.offsetWidth; box.classList.add('is-liquid');
            setTimeout(() => box.classList.remove('is-liquid'), 320);
        });
    }
    const { selectedYear, selectedMonth, includeInvest, payChartMode, catTab, payTab, cardOffset } = ctx;
    watch(() => [selectedYear.value, selectedMonth.value], () => replayIn('[data-fd-refresh~="month"]'));
    watch(includeInvest, () => replayIn('[data-fd-refresh~="invest"]'));
    watch(payChartMode, () => replayIn('[data-fd-refresh~="paymode"]'));
    watch(catTab, () => replayIn('[data-fd-refresh~="cattab"]'));
    watch(payTab, () => replayIn('[data-fd-refresh~="paytab"]'));
    // 信用卡「更早一期」＝內容從左邊滑入、「較新一期」＝從右邊滑入
    watch(cardOffset, (n, o) => replayIn('[data-fd-refresh~="card"]', n > o ? 'l' : 'r'));
    return {};
};
