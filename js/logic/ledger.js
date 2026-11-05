// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// 預付／儲值／非消費類別的預設設定（可在「工具 → 付款與帳單」修改）
export const DEFAULT_FLOW = {
    prepaidMethods: ['每月預付', '悠遊卡儲值'],                                   // 這些付款方式的「使用」記在已付金額，金額為 0
    fundingRules: [{ category: '固定支出', item: '每月費用' }, { category: '儲值', item: '交通費' }], // 先出錢、之後才分項使用的「儲值事件」
    nonConsumptionCategories: ['投資儲蓄'],                                       // 不算消費支出的類別
    passThroughCategories: ['墊付']                                              // 代墊：支出與回收都不算消費、也不算收入
};
// 類別固定顏色：預設對照；新類別從擴充色盤依序分配後固定（存在設定、跨裝置同步）
export const DEFAULT_CATEGORY_COLORS = { '固定支出': '#6366f1', '變動支出': '#10b981', '保險': '#06b6d4', '儲值': '#a855f7', '墊付': '#ef4444',
    '固定收入': '#84cc16', '投資儲蓄': '#f97316', '投資': '#f59e0b', '儲蓄': '#ec4899', '其他': '#64748b' };
export const EXTRA_PALETTE = ['#3b82f6', '#14b8a6', '#eab308', '#8b5cf6', '#f43f5e', '#22c55e', '#0ea5e9', '#d946ef', '#fb923c', '#a3e635', '#2dd4bf', '#94a3b8'];
export const COLOR_CHOICES = ['#6366f1', '#10b981', '#06b6d4', '#a855f7', '#ef4444', '#84cc16', '#f97316', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6', '#64748b'];
// 幫還沒有顏色的類別分配顏色；有新增回傳 true
export const assignCategoryColors = (st, cats) => {
    if (!st.categoryColors || typeof st.categoryColors !== 'object') st.categoryColors = {};
    let changed = false;
    cats.forEach(c => {
        if (!c || st.categoryColors[c]) return;
        let col = DEFAULT_CATEGORY_COLORS[c];
        if (!col) {
            const used = new Set(Object.values(st.categoryColors).map(x => String(x).toLowerCase()));
            col = EXTRA_PALETTE.find(x => !used.has(x)) || EXTRA_PALETTE[Object.keys(st.categoryColors).length % EXTRA_PALETTE.length];
        }
        st.categoryColors[c] = col; changed = true;
    });
    return changed;
};
// 類別屬性（三選一）：代墊 > 不算消費 > 一般消費；底層仍用兩個清單存，舊設定與舊裝置不需轉換
export const categoryKindOf = (st, c) => (st.passThroughCategories || []).includes(c) ? 'pass' : (st.nonConsumptionCategories.includes(c) ? 'noncons' : 'normal');
export const withDefaultSettings = (v) => ({
    creditCards: Array.isArray(v && v.creditCards) ? v.creditCards : [],
    prepaidMethods: Array.isArray(v && v.prepaidMethods) ? v.prepaidMethods : [...DEFAULT_FLOW.prepaidMethods],
    fundingRules: Array.isArray(v && v.fundingRules) ? v.fundingRules : DEFAULT_FLOW.fundingRules.map(r => ({ ...r })),
    nonConsumptionCategories: Array.isArray(v && v.nonConsumptionCategories) ? v.nonConsumptionCategories : [...DEFAULT_FLOW.nonConsumptionCategories],
    passThroughCategories: Array.isArray(v && v.passThroughCategories) ? v.passThroughCategories : [...DEFAULT_FLOW.passThroughCategories],
    hiddenOptions: Array.isArray(v && v.hiddenOptions) ? v.hiddenOptions : [],
    categoryColors: (v && v.categoryColors && typeof v.categoryColors === 'object' && !Array.isArray(v.categoryColors)) ? { ...v.categoryColors } : {},
    categoryItems: (v && v.categoryItems && typeof v.categoryItems === 'object' && !Array.isArray(v.categoryItems) && Object.keys(v.categoryItems).length)
        ? v.categoryItems : JSON.parse(JSON.stringify(DEFAULT_CATEGORY_ITEMS))
});
export const isPassThrough = (e, st) => (st.passThroughCategories || []).includes(e.category);
// 投資＝ETF投資＋不算消費的類別；代墊不算投資（兩張圖表一律不顯示代墊）
export const isInvestExpense = (e, st) => !isPassThrough(e, st) && (e.item === 'ETF投資' || st.nonConsumptionCategories.includes(e.category));
export const isFundingEvent = (e, st) => st.fundingRules.some(r => r.category === e.category && r.item === e.item);

// 月收支表：用「金額」計算（錢實際流出／流入）
//   收入 = 收入（不含 ETF賣出）；消費支出 = 支出且非投資、非「非消費類別」；投資淨投入 = ETF投資 − ETF賣出
//   非消費類別下、既不是 ETF 的支出（例如單純存錢）→ 「其他儲蓄」，不會從表上消失
export const calcLedger = (list, st) => {
    const months = {}, years = {};
    const pass = st.passThroughCategories || [];
    const bucket = (m, key) => (m[key] = m[key] || { income: 0, consume: 0, buy: 0, sell: 0, other: 0, advanceOut: 0, advanceIn: 0 });
    list.forEach(e => {
        const d = String(e.date || '');
        if (!/^\d{4}-\d{2}/.test(d)) return;
        const amt = Number(e.amount || 0);
        if (!amt) return;
        [bucket(months, d.slice(0, 7)), bucket(years, d.slice(0, 4))].forEach(b => {
            if (e.item === 'ETF投資') b.buy += (e.type === '收入' ? -amt : amt);
            else if (e.item === 'ETF賣出') b.sell += (e.type === '支出' ? -amt : amt);
            else if (pass.includes(e.category)) { if (e.type === '支出') b.advanceOut += amt; }   // 代墊：只認支出（收回看結算日）；代墊類別的收入不計入
            else if (e.type === '收入') b.income += amt;
            else if (st.nonConsumptionCategories.includes(e.category)) b.other += amt;
            else b.consume += amt;
        });
        // 代墊收回：墊付支出若填了結算日，該筆金額算在「結算日所在月份」的收回（與消費月份可不同月）
        if (e.type === '支出' && e.item !== 'ETF投資' && e.item !== 'ETF賣出' && pass.includes(e.category)) {
            const sd = String(e.settlementDate || '');
            if (/^\d{4}-\d{2}/.test(sd)) [bucket(months, sd.slice(0, 7)), bucket(years, sd.slice(0, 4))].forEach(b => { b.advanceIn += amt; });
        }
    });
    return { months, years };
};
// 結餘 = 收入 − 消費支出；代墊淨額 = 墊付支出（消費月）− 收回（結算日所在月）；投資後現金 = 結餘 − 投資淨投入 − 其他儲蓄 − 代墊淨額
export const deriveLedger = (b) => ({ ...b, net: b.income - b.consume, invest: b.buy - b.sell, advance: (b.advanceOut || 0) - (b.advanceIn || 0),
    after: b.income - b.consume - (b.buy - b.sell) - b.other - ((b.advanceOut || 0) - (b.advanceIn || 0)) });

// 項目圖：看「錢花在哪」。預付類付款方式用已付金額，其他用金額；排除儲值事件（避免和之後的分項使用重複）
export const buildItemRows = (list, st, includeInvest) => {
    const out = [];
    list.forEach(e => {
        if (e.type !== '支出') return;
        if (isPassThrough(e, st)) return;   // 代墊不出現在圖表
        if (!includeInvest && isInvestExpense(e, st)) return;
        if (isFundingEvent(e, st)) return;
        const prepaid = st.prepaidMethods.includes(e.paymentMethod);
        const amt = Number(e.amount || 0), paid = Number(e.paidAmount || 0);
        const value = prepaid ? (paid > 0 ? paid : amt) : amt;
        if (!(value > 0)) return;
        out.push({ e, value, source: prepaid ? 'prepaid' : 'self' });
    });
    return out;
};
export const aggregateItems = (rows, topN) => {
    const map = {};
    rows.forEach(r => {
        const key = r.e.item || '(未填項目)';
        const m = map[key] || (map[key] = { item: key, self: 0, prepaid: 0, cats: {}, rows: [] });
        m[r.source === 'prepaid' ? 'prepaid' : 'self'] += r.value;
        const c = r.e.category || '(未分類)';
        m.cats[c] = (m.cats[c] || 0) + r.value;
        m.rows.push(r);
    });
    const arr = Object.values(map).map(m => ({ ...m, total: m.self + m.prepaid, category: Object.entries(m.cats).sort((a, b) => b[1] - a[1])[0][0] }))
        .sort((a, b) => b.total - a.total);
    const top = arr.slice(0, topN);
    const rest = arr.slice(topN);
    if (rest.length) {
        const self = rest.reduce((a, x) => a + x.self, 0), prepaid = rest.reduce((a, x) => a + x.prepaid, 0);
        top.push({ item: '其他', isOther: true, self, prepaid, total: self + prepaid, category: '', rows: rest.flatMap(x => x.rows), parts: rest.map(x => ({ item: x.item, total: x.total })) });
    }
    return top;
};
// 付款管道圖：看「錢從哪裡流出」，用金額；預設不含投資
export const aggregatePayments = (list, st, includeInvest) => {
    const m = {};
    list.forEach(e => {
        if (e.type !== '支出') return;
        if (isPassThrough(e, st)) return;   // 代墊不出現在圖表
        if (!includeInvest && isInvestExpense(e, st)) return;
        const amt = Number(e.amount || 0);
        if (!(amt > 0)) return;
        const k = e.paymentMethod || '未填';
        m[k] = (m[k] || 0) + amt;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
// 類別 → 可選項目（'*' 代表全部項目）。新增收支時，項目只會列出所屬類別的項目。
export const DEFAULT_CATEGORY_ITEMS = {
    '固定支出': ['交通費', '飲食費', '電話費', '剪頭髮', '採買費', '每月費用', '房租'],
    '變動支出': ['出遊', '購物', '醫療', '額外交通費', '額外飲食費'],
    '投資儲蓄': ['ETF投資', 'ETF賣出'],
    '保險': ['保險費'],
    '儲值': ['交通費'],
    '墊付': '*',
    '固定收入': ['薪資', '福利獎金', '年終', '年度獎金', '股息']
};
// 找出「類別／項目」不在對照表內的既有紀錄（類別不在表內也算）
export const findCategoryMismatches = (list, map) => {
    const groups = {};
    list.forEach(e => {
        if (!e.category || !e.item) return;
        const allow = map[e.category];
        const ok = allow === '*' || (Array.isArray(allow) && allow.includes(e.item));
        if (ok) return;
        const key = `${e.category}||${e.item}`;
        const g = groups[key] || (groups[key] = { key, category: e.category, item: e.item, count: 0, ids: [] });
        g.count++; g.ids.push(e.id);
    });
    return Object.values(groups).sort((a, b) => b.count - a.count);
};
// 建議改成哪個類別：對照表中「允許這個項目」的第一個類別（不含目前的類別）
export const suggestCategoryFor = (item, current, map) => Object.keys(map).find(c => c !== current && Array.isArray(map[c]) && map[c].includes(item)) || '';
