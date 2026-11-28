import { fmtMoney, fmtCompact, COMPACT_FROM } from '../logic/money.js';
// FinDash 功能模組：動態回饋（內容更新時重播過渡、大數字滾動）
// 只動 opacity／transform；系統設為「減少動態」時，數字直接換成新值、位移改成單純淡入（CSS 處理）。
const { ref, computed, watch, nextTick, onBeforeUnmount } = Vue;

const prefersReduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmtNTD = (v) => fmtMoney(v);

// <fd-num :value="數字"></fd-num>：數字變動時，從舊值滾到新值（約 0.4 秒）；格式與 formatCurrency 相同
export const FdNum = {
    props: { value: { type: Number, default: 0 }, compact: { type: Boolean, default: false }, compactFrom: { type: Number, default: COMPACT_FROM } },
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
        const isBig = computed(() => Math.abs(Math.round(shown.value || 0)) >= props.compactFrom);
        return { shown, fmtNTD, fmtCompact, isBig };
    },
    // compact：窄螢幕（<480px）且 ≥100 萬時改顯示萬／億（兩種都畫出來，用 CSS 擇一，捲動動畫不受影響）
    template: '<span v-if="compact && isBig"><span class="fd-amt-full">{{ fmtNTD(shown) }}</span><span class="fd-amt-short">{{ fmtCompact(shown, compactFrom) }}</span></span><span v-else>{{ fmtNTD(shown) }}</span>'
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
    // 果凍切換（V27.3）：點切換鈕／導覽時，先記下移動方向（r／l、d／u）。滑塊用 left／right 定位，
    // CSS 讓「前進那一側」先動、「後面那一側」稍後跟上＝先拉長再收回，滑塊位置由範本的 --i／--ni／--bn-i 決定
    if (typeof document !== 'undefined' && document.addEventListener) {
        const setDir = (box, from, to, pos, neg) => { if (to < 0 || isNaN(from) || to === from) return; box.setAttribute('data-dir', to > from ? pos : neg); };
        document.addEventListener('click', (ev) => {
            const t = ev.target && ev.target.closest ? ev.target : null; if (!t) return;
            const seg = t.closest('.fd-seg2 > button');
            if (seg) { const box = seg.parentElement, kids = [].filter.call(box.children, el => el.tagName === 'BUTTON'); setDir(box, parseFloat(box.style.getPropertyValue('--i')), kids.indexOf(seg), 'r', 'l'); return; }
            const bn = t.closest('.fd-bn-item[data-tab]');
            if (bn) { const box = bn.parentElement, kids = [].filter.call(box.children, el => el.classList.contains('fd-bn-item')); setDir(box, parseFloat(box.style.getPropertyValue('--bn-i')), kids.indexOf(bn), 'r', 'l'); return; }
            const nv = t.closest('.fd-nav-item');
            if (nv) { const box = nv.parentElement, kids = [].filter.call(box.children, el => el.classList.contains('fd-nav-item')); const ind = box.querySelector('.fd-nav-ind'); setDir(box, ind ? parseFloat(ind.style.getPropertyValue('--ni')) : NaN, kids.indexOf(nv), 'd', 'u'); }
        }, true);   // capture：不被其他元件的 @click.stop 擋掉
    }
    const { selectedYear, selectedMonth, cardOffset } = ctx;
    watch(() => [selectedYear.value, selectedMonth.value], () => replayIn('[data-fd-refresh~="month"]'));
    // 信用卡「更早一期」＝內容從左邊滑入、「較新一期」＝從右邊滑入
    watch(cardOffset, (n, o) => replayIn('[data-fd-refresh~="card"]', n > o ? 'l' : 'r'));
    return {};
};
