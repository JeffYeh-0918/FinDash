// FinDash 功能模組：手機與平板的卡片（畫面寬度 < 1024px 才會顯示；電腦版仍是表格）
// 內容：依日期分組、類別圖示、選取／取消選取、月收支表比例條。（V18：畫面寬度 < 1024px 顯示卡片；長按選取與拖曳排序在 card-drag.js）
// 卡片的 HTML 在 index.html（class 以 fdm- 開頭），樣式在 css/app.css。
const { ref, computed, watch, onMounted } = Vue;

export const useMobileCards = (ctx) => {
    // 取用前面模組已建立的成員
    const { displayedExpenses, filteredExpenses, filteredStockTrades, selectedExpenseIds, selectedStockIds, openExpenseModal, openStockModal, catColor } = ctx;

    /* ---------- 依日期分組 ---------- */
    const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
    const dayLabel = (d) => {
        const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return d || '未填日期';
        return `${m[2]}/${m[3]} 週${WEEK[new Date(+m[1], +m[2] - 1, +m[3]).getDay()]}`;
    };
    // 只合併「相鄰且同一天」的紀錄：清單可以手動排序，不能因為分組而改變順序
    const groupRuns = (list, keyOf) => {
        const out = [];
        list.forEach(x => {
            const k = keyOf(x), last = out[out.length - 1];
            if (last && last.key === k) last.items.push(x); else out.push({ key: k, items: [x] });
        });
        return out;
    };
    const expenseDayGroups = computed(() => groupRuns(displayedExpenses.value, e => e.date || '').map(g => {
        let exp = 0, inc = 0;
        g.items.forEach(e => { const a = Number(e.amount || 0); if (e.type === '收入') inc += a; else exp += a; });
        return { id: g.items[0].id, label: dayLabel(g.key), exp, inc, items: g.items };
    }));
    const stockDayGroups = computed(() => groupRuns(filteredStockTrades.value, t => t.date || '').map(g => ({ id: g.items[0].id, label: dayLabel(g.key), items: g.items })));

    /* ---------- 類別圖示（lucide 線條圖示；用項目、類別名稱推測，找不到就用預設） ---------- */
    const ICONS = [[/飲食|餐|飯/, 'utensils'], [/交通|悠遊|捷運|公車|油/, 'bus'], [/電話|網路|通訊/, 'smartphone'], [/剪|髮/, 'scissors'], [/採買|超市/, 'shopping-cart'], [/購物/, 'shopping-bag'],
        [/醫|藥|診/, 'stethoscope'], [/房租|每月/, 'home'], [/出遊|旅|機票/, 'plane'], [/保險/, 'shield'], [/薪資|薪水/, 'briefcase'], [/獎金|年終|福利/, 'gift'], [/股息|配息/, 'coins'],
        [/賣出/, 'trending-down'], [/ETF|投資|股票/, 'trending-up'], [/儲值/, 'credit-card'], [/墊付|代墊/, 'handshake']];
    const expenseIconName = (e) => {
        for (const text of [e.item, e.category]) { const hit = ICONS.find(([re]) => re.test(String(text || ''))); if (hit) return hit[1]; }
        return e.type === '收入' ? 'wallet' : 'tag';
    };
    // 圖示圓圈的底色＝該類別在設定裡的顏色（換色後手機版跟著換）
    const catCircleStyle = (cat) => {
        const c = /^#[0-9a-fA-F]{6}$/.test(catColor(cat) || '') ? catColor(cat) : '#64748b';
        return { background: c + '2b', borderColor: c + '66', color: c };   // 線條圖示用 currentColor，所以也要設文字色
    };

    /* ---------- 選取、點一下修改（長按選取與拖曳在 card-drag.js） ---------- */
    const listOf = (kind) => (kind === 'stock' ? selectedStockIds : selectedExpenseIds);
    const fdmIsSel = (kind, id) => listOf(kind).value.includes(id);
    const fdmToggleSel = (kind, id) => { const r = listOf(kind); r.value = r.value.includes(id) ? r.value.filter(x => x !== id) : [...r.value, id]; };
    const fdmTap = (kind, item) => {
        if (fdmSelecting(kind)) { fdmToggleSel(kind, item.id); return; }   // 選取模式中：點一下＝加選／取消
        if (kind === 'stock') openStockModal(item); else openExpenseModal(item);
    };
    const batchMenuOpen = ref(false);
    // 選取模式：按標題列的「選取」進入，或長按卡片進入；有勾選時也算選取中。按「完成」離開並清除勾選。
    const modes = { expense: ref(false), stock: ref(false) };
    const fdmSelecting = (kind) => modes[kind].value || listOf(kind).value.length > 0;
    const fdmEnter = (kind) => { modes[kind].value = true; };
    const fdmDone = (kind) => { modes[kind].value = false; listOf(kind).value = []; batchMenuOpen.value = false; };
    // 全選＝目前「篩選結果」的全部紀錄（不只已載入的 100 筆）
    const filteredOf = (kind) => (kind === 'stock' ? filteredStockTrades : filteredExpenses).value;
    const fdmAllSelected = (kind) => { const all = filteredOf(kind); return all.length > 0 && all.every(x => listOf(kind).value.includes(x.id)); };
    const fdmToggleAll = (kind) => { listOf(kind).value = fdmAllSelected(kind) ? [] : filteredOf(kind).map(x => x.id); };
    // 有選取時：隱藏浮動「＋」按鈕（底部要放操作列），並收起批次選單
    watch([selectedExpenseIds, selectedStockIds, modes.expense, modes.stock], ([a, b, me, ms]) => {
        if (typeof document !== 'undefined' && document.body) document.body.classList.toggle('fdm-selecting', a.length + b.length > 0 || me || ms);
        if (!a.length && !b.length) batchMenuOpen.value = false;
    });

    /* ---------- 月收支表 ---------- */
    // 比例條：收入當 100%，依序是 消費、投資、剩餘；沒有收入就不畫
    // 月收支比例條：消費、淨投入、剩餘依「收入」比例；超支時縮放。
    // V21：沒有收入的月份改以「支出（消費＋淨投入）」當 100%，不再整條消失；segs＝實際畫出來的每一段（含金額），卡片上逐段標示顏色與金額，不再靠最上方的總圖例對照
    const monthBar = (r) => {
        const inc = Number(r.income || 0);
        const cAmt = Math.max(0, Number(r.consume || 0)), iAmt = Math.max(0, Number(r.invest || 0));   // 投資淨額為負（賣出多於買進）不畫負的長度
        const noIncome = inc <= 0;
        const base = noIncome ? cAmt + iAmt : inc;
        if (base <= 0) return null;
        let c = cAmt / base, i = iAmt / base;
        const over = !noIncome && c + i > 1;
        if (over) { const s = c + i; c /= s; i /= s; }
        const round = (x) => Math.round(x * 1000) / 10;
        const rest = over || noIncome ? 0 : round(1 - c - i);
        const restAmt = over || noIncome ? 0 : Math.max(0, inc - cAmt - iAmt);
        const segs = [
            { key: 'c', label: '消費', color: '#818cf8', pct: round(c), amt: cAmt },
            { key: 'i', label: '淨投入', color: '#fbbf24', pct: round(i), amt: iAmt },
            { key: 'r', label: '剩餘', color: '#34d399', pct: rest, amt: restAmt }
        ].filter(s => s.amt > 0);
        return { consume: round(c), invest: round(i), rest, over, noIncome, segs };
    };
    // 月收支卡片的標示：左＝進來的錢（收入、淨賣出），右＝出去的錢（消費、淨投入）再加剩餘；顏色與長條一致（收入沒有長條，色點用空心圈）
    // 淨賣出／淨投入＝這個月 ETF 賣出與買進相抵後的淨額（賣出多於買進才有「淨賣出」，反之才有「淨投入」）
    const monthFlow = (r) => {
        const bar = monthBar(r), inv = Number(r.invest || 0);
        const left = [{ key: 'in', label: '收入', color: null, amt: Number(r.income || 0) }];
        if (inv < 0) left.push({ key: 'sell', label: '淨賣出', color: '#fbbf24', amt: -inv });
        const right = [{ key: 'c', label: '消費', color: '#818cf8', amt: Number(r.consume || 0) }];
        if (inv > 0) right.push({ key: 'buy', label: '淨投入', color: '#fbbf24', amt: inv });
        const rest = bar ? bar.segs.find(s => s.key === 'r') : null;
        if (rest) right.push({ key: 'r', label: '剩餘', color: '#34d399', amt: rest.amt });
        return { left, right, noIncome: !!(bar && bar.noIncome) };
    };
    const expandedMonths = ref({});
    const toggleMonthDetail = (key) => { expandedMonths.value = { ...expandedMonths.value, [key]: !expandedMonths.value[key] }; };

    // 手機的固定標題列要貼在「分頁列」下方：量分頁列的高度
    onMounted(() => {
        const sync = () => {
            const nav = document.querySelector('nav.sticky');
            if (nav) document.documentElement.style.setProperty('--tabbar-h', nav.offsetHeight + 'px');
        };
        sync();
        window.addEventListener('resize', sync);
    });

    return {
        expenseDayGroups, stockDayGroups, expenseIconName, catCircleStyle,
        fdmIsSel, fdmToggleSel, fdmTap, fdmSelecting, fdmEnter, fdmDone, fdmAllSelected, fdmToggleAll, batchMenuOpen,
        monthBar, monthFlow, expandedMonths, toggleMonthDetail
    };
};
