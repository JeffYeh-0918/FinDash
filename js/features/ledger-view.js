// FinDash 功能模組：月收支表、頁面上方卡片、信用卡待結算、項目／付款管道圖表資料
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。
import { deriveLedger, DEFAULT_CATEGORY_COLORS, aggregateItems, buildItemRows, aggregatePaymentsByCategory, chartCategoryTotals, excludeCategories, clipPlan, calcLedger } from '../logic/ledger.js';
import { ymd, cardPeriod } from '../logic/trades.js';
import { cleanSymbol } from '../logic/symbol.js';

const { computed, ref, watch, nextTick } = Vue;

export const useLedgerView = (ctx) => {
    // 取用前面模組已建立的成員
    const {
        selectedYear, selectedMonth, expenses, appSettings, includeInvest, renderCharts,
        expenseMonthFilterScope, filterYears, filterMonths, activeTab,
        expenseSearch, selectedCategoryFilters, selectedItemFilters, selectedPaymentFilters, selectedTypeFilters, selectedExpenseIds
    } = ctx;

    const monthlyExpensesFiltered = computed(() => {
        const prefix = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`;
        return expenses.value.filter(e => e.date && e.date.startsWith(prefix));
    });
    // 頁面上方卡片：與「月收支表」同一套定義（收入不含 ETF賣出、代墊不算；支出為消費支出，不含投資與代墊）
    const monthKey = computed(() => `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`);
    const monthlyLedger = computed(() => deriveLedger(ledger.value.months[monthKey.value] || { income: 0, consume: 0, buy: 0, sell: 0, other: 0, advanceOut: 0, advanceIn: 0 }));
    const monthlyTotalIncome = computed(() => monthlyLedger.value.income);
    const monthlyTotalExpense = computed(() => monthlyLedger.value.consume);
    const monthlyInvestNet = computed(() => monthlyLedger.value.invest);
    const monthlySavingsRate = computed(() => monthlyLedger.value.income === 0 ? 0 : Math.max(0, Math.round(monthlyLedger.value.net / monthlyLedger.value.income * 100)));
    const toggleCard = (name) => {
        const list = appSettings.value.creditCards;
        const i = list.findIndex(c => c.name === name);
        if (i >= 0) list.splice(i, 1); else list.push({ name, closingDay: 1 });
    };
    const setCardDay = (name, v) => {
        const d = parseInt(v, 10);
        const c = appSettings.value.creditCards.find(x => x.name === name);
        if (c && d) c.closingDay = Math.min(31, Math.max(1, d));
    };
    // ---------- 信用卡待結算 ----------
    const cardOffset = ref(0);
    const cardDetail = ref(null);
    const cardRows = (name, p) => expenses.value
        .filter(e => e.type === '支出' && e.paymentMethod === name && e.date >= p.start && e.date <= p.end && Number(e.amount || 0) !== 0)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const cardStatements = computed(() => {
        const today = new Date(), todayText = ymd(today);
        return appSettings.value.creditCards.map(c => {
            const periods = [1, 0].map(i => {  // 左邊較舊（上期）、右邊較新（本期）
                const k = cardOffset.value + i;
                const p = cardPeriod(c.closingDay, k, today);
                const rows = cardRows(c.name, p);
                const total = rows.reduce((sum, e) => sum + Number(e.amount || 0), 0);
                return {
                    key: k, ...p, count: rows.length, total,
                    closed: p.end < todayText,
                    title: cardOffset.value === 0 ? (i === 0 ? '本期累計' : '上期帳單') : `${p.end.slice(0, 7)} 帳單`
                };
            });
            return { name: c.name, closingDay: c.closingDay, periods };
        });
    });
    const openCardDetail = (card, p) => {
        const rows = cardRows(card.name, p);
        cardDetail.value = { name: card.name, title: p.title, start: p.start, end: p.end, rows, total: rows.reduce((s, e) => s + Number(e.amount || 0), 0) };
    };
    // 設定裡存的顏色（色票與檢色器顯示用）；圖表用 catChartColor（太暗的顏色自動提亮，深色底才看得清）
    const catColor = (cat) => {
        if (!cat) return '#64748b';
        const c = appSettings.value.categoryColors && appSettings.value.categoryColors[cat];
        return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : (DEFAULT_CATEGORY_COLORS[cat] || '#64748b');
    };
    const catChartColor = (cat) => {
        const hex = catColor(cat), n = parseInt(hex.slice(1), 16);
        let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        if (lum < 0.3) { const t = 0.45; r = Math.round(r + (255 - r) * t); g = Math.round(g + (255 - g) * t); b = Math.round(b + (255 - b) * t); }
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    };
    const lightColor = (hex, a = 0.35) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`; };
    // V19：點圖例（類別）可從「項目圖」與「付款管道圖」一起隱藏／顯示；只是目前畫面的檢視狀態，不存檔、重新整理就恢復全部
    const chartHiddenCats = ref([]);
    const chartExpenses = computed(() => excludeCategories(monthlyExpensesFiltered.value, chartHiddenCats.value));
    const toggleChartCat = (name) => { chartHiddenCats.value = chartHiddenCats.value.includes(name) ? chartHiddenCats.value.filter(x => x !== name) : [...chartHiddenCats.value, name]; };
    const resetChartCats = () => { chartHiddenCats.value = []; };
    // 圖例：本月有支出的類別（金額大的在前）；已隱藏但本月沒有資料的類別也留著，才找得到地方取消隱藏
    const chartCategoryLegend = computed(() => {
        const names = chartCategoryTotals(monthlyExpensesFiltered.value, appSettings.value, includeInvest.value).map(x => x[0]);
        chartHiddenCats.value.forEach(n => { if (!names.includes(n)) names.push(n); });
        return names.map(name => ({ name, color: catChartColor(name), hidden: chartHiddenCats.value.includes(name) }));
    });
    const itemChartData = computed(() => aggregateItems(buildItemRows(chartExpenses.value, appSettings.value, includeInvest.value), 5));
    const paymentChartData = computed(() => aggregatePaymentsByCategory(chartExpenses.value, appSettings.value, includeInvest.value));   // { categories, rows }：付款管道依類別堆疊
    // V20：付款管道圖——金額／占比切換；金額模式下，有大額離群值時自動截斷（只是檢視狀態，不存檔）
    const payChartMode = ref('amount');
    const payChartClip = computed(() => (payChartMode.value === 'amount' ? clipPlan(paymentChartData.value.rows.map(r => r.total)) : { max: null, indexes: [] }));
    const payChartClipNote = computed(() => {
        const p = payChartClip.value, rows = paymentChartData.value.rows;
        if (!p.indexes.length) return '';
        return '長條已截斷，避免壓縮其他管道：' + p.indexes.map(i => `${rows[i].method} 實際 NT$ ${Math.round(rows[i].total).toLocaleString()}`).join('、') + '。切到「占比」可看完整構成。';
    });
    const itemDetail = ref(null);
    const openItemDetail = (it) => {
        if (!it) return;
        const rows = [...it.rows].sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)));
        itemDetail.value = { title: it.item, self: it.self, prepaid: it.prepaid, total: it.total, rows, parts: it.parts || null };
    };
    watch([includeInvest, appSettings, chartHiddenCats, payChartMode], () => nextTick(() => renderCharts()), { deep: true });
    // 本月投資（獨立區塊，不進上面的圖表）
    const monthlyInvestSummary = computed(() => {
        const r = { buy: 0, sell: 0, dividend: 0, bySymbol: {} };
        monthlyExpensesFiltered.value.forEach(e => {
            const amt = Number(e.amount || 0);
            const sym = cleanSymbol(e.content);
            if (e.item === 'ETF投資') { const v = e.type === '收入' ? -amt : amt; r.buy += v; (r.bySymbol[sym] = r.bySymbol[sym] || { symbol: sym, buy: 0, sell: 0 }).buy += v; }
            else if (e.item === 'ETF賣出') { const v = e.type === '支出' ? -amt : amt; r.sell += v; (r.bySymbol[sym] = r.bySymbol[sym] || { symbol: sym, buy: 0, sell: 0 }).sell += v; }
            else if (e.item === '股息' && e.type === '收入') r.dividend += amt;
        });
        r.list = Object.values(r.bySymbol).sort((a, b) => (b.buy + b.sell) - (a.buy + a.sell));
        return r;
    });
    // ---------- 月收支表 ----------
    const ledger = computed(() => calcLedger(expenses.value, appSettings.value));
    const ZERO_BUCKET = () => ({ income: 0, consume: 0, buy: 0, sell: 0, other: 0, advanceOut: 0, advanceIn: 0 });
    const bucketHasData = (b) => !!b && Object.values(b).some(v => v !== 0);
    const ledgerRow = (b) => deriveLedger(b || ZERO_BUCKET());
    const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ledgerMonthRows = computed(() => {
        const now = new Date(), rows = [], months = ledger.value.months;
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = ymKey(d);
            const prevB = months[ymKey(new Date(d.getFullYear(), d.getMonth() - 1, 1))];
            const yoyB = months[ymKey(new Date(d.getFullYear() - 1, d.getMonth(), 1))];
            rows.push({ key, label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`, isNow: i === 0, ...ledgerRow(months[key]),
                prev: bucketHasData(prevB) ? ledgerRow(prevB) : null, yoy: bucketHasData(yoyB) ? ledgerRow(yoyB) : null });
        }
        return rows;
    });
    const ledgerYearRows = computed(() => {
        const out = [], months = ledger.value.months;
        Object.keys(ledger.value.years).sort().reverse().forEach(y => {
            const total = ledgerRow(ledger.value.years[y]);
            const n = Object.keys(months).filter(k => k.startsWith(y + '-') && bucketHasData(months[k])).length;
            out.push({ key: y, kind: 'total', label: `${y} 年合計${y === String(new Date().getFullYear()) ? '（至今）' : ''}`, ...total });
            if (n > 0) {
                const avg = (v) => Math.round(v / n);
                out.push({ key: y + '-avg', kind: 'avg', label: `月均（${n} 個月有資料）`, income: avg(total.income), consume: avg(total.consume), net: avg(total.net),
                    invest: avg(total.invest), advance: avg(total.advance), other: avg(total.other), after: avg(total.after) });
            }
        });
        return out;
    });
    const showOtherCol = computed(() => ledgerMonthRows.value.some(r => r.other) || ledgerYearRows.value.some(r => r.other));
    const showAdvanceCol = computed(() => ledgerMonthRows.value.some(r => r.advanceOut || r.advanceIn) || ledgerYearRows.value.some(r => r.advanceOut || r.advanceIn));
    // 點月收支表的某個月 → 切到日常收支，並把「年份／月份」篩選器填上該年月（其他篩選與勾選一併清掉，才看得到該月完整明細）
    const goToMonth = (key) => {
        const [y, m] = key.split('-').map(Number);
        selectedYear.value = y; selectedMonth.value = m;
        expenseMonthFilterScope.value = 'MONTH';
        filterYears.value = [String(y)]; filterMonths.value = [String(m)];
        expenseSearch.value = '';
        selectedCategoryFilters.value = []; selectedItemFilters.value = []; selectedPaymentFilters.value = []; selectedTypeFilters.value = [];
        selectedExpenseIds.value = [];
        activeTab.value = 'expenses';
        nextTick(() => {
            renderCharts();
            const el = document.getElementById('expense-list');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    return {
        monthlyTotalIncome, monthlyTotalExpense, monthlyInvestNet, monthlySavingsRate, toggleCard, setCardDay,
        cardOffset, cardDetail, cardStatements, openCardDetail, catColor, catChartColor,
        lightColor, itemChartData, chartCategoryLegend, chartHiddenCats, toggleChartCat, resetChartCats, paymentChartData, payChartMode, payChartClip, payChartClipNote, itemDetail, openItemDetail,
        monthlyInvestSummary, ledgerMonthRows, ledgerYearRows, showOtherCol, showAdvanceCol, goToMonth
    };
};
