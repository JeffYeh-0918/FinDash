// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
import { cleanSymbol } from './symbol.js';

export const sortTrades = (list) => [...list].sort((a, b) => {
    const d = String(a.date || '').localeCompare(String(b.date || ''));
    if (d !== 0) return d;
    return (a.action === '賣出' ? 1 : 0) - (b.action === '賣出' ? 1 : 0);  // 同一天先算買進、再算賣出
});
// 已實現損益（移動平均成本法）：賣出淨收入 −（賣出當下平均成本 × 賣出股數）
export const calcRealized = (trades) => {
    const pos = {}; const by = {}; const rows = []; const ignored = []; let total = 0;
    sortTrades(trades).forEach(t => {
        const sym = cleanSymbol(t.symbol);
        if (!sym) return;
        const p = pos[sym] || (pos[sym] = { shares: 0, cost: 0 });
        const shares = Number(t.shares || 0), amt = Number(t.totalAmount || 0);
        if (t.action === '買進') { p.shares += shares; p.cost += amt; }
        else if (t.action === '賣出' && shares > 0) {
            if (p.shares <= 0) { ignored.push({ date: t.date, symbol: sym, shares, reason: '沒有對應的買進紀錄' }); return; }
            const sell = Math.min(shares, p.shares);
            if (sell < shares) ignored.push({ date: t.date, symbol: sym, shares: shares - sell, reason: '賣出股數超過持有，超出部分未計入' });
            const avg = p.cost / p.shares;
            const proceeds = amt * (sell / shares);
            const gain = proceeds - avg * sell;
            rows.push({ date: t.date, symbol: sym, name: t.name || '', shares: sell, avgCost: avg, proceeds, cost: avg * sell, gain });
            p.shares -= sell; p.cost -= avg * sell;
            if (p.shares <= 0) { p.shares = 0; p.cost = 0; }
            by[sym] = (by[sym] || 0) + gain; total += gain;
        }
    });
    return { total, by, rows, ignored };
};
// 股息：類別為「股息」，內容為股票代碼
export const calcDividends = (list) => {
    const m = {};
    list.forEach(e => {
        if (e.item !== '股息' && e.category !== '股息') return;  // 項目或類別為「股息」皆可
        const sym = cleanSymbol(e.content);
        if (!sym) return;
        const amt = Number(e.amount || 0);
        m[sym] = (m[sym] || 0) + (e.type === '支出' ? -amt : amt);
    });
    return m;
};
// 信用卡帳期：k=0 為包含今天的那一期，k=1 為上一期…；結帳日 29~31 遇短月自動取月底
export const lastDayOf = (y, m) => new Date(y, m + 1, 0).getDate();
export const closingOf = (y, m, day) => new Date(y, m, Math.min(day, lastDayOf(y, m)));
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const cardPeriod = (closingDay, k, today) => {
    const y = today.getFullYear();
    let m = today.getMonth();
    if (today.getDate() > Math.min(closingDay, lastDayOf(y, m))) m += 1;
    m -= k;
    const end = closingOf(y, m, closingDay);
    const prevEnd = closingOf(y, m - 1, closingDay);
    const start = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
    return { start: ymd(start), end: ymd(end) };
};
