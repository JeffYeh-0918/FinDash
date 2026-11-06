// 本機資料 ↔ 雲端資料 的轉換層（不碰網路、不碰畫面）。
// 換資料庫（例如 Supabase）時，只需要改這支與 api.js；畫面與同步引擎都不用動。
import { cleanSymbol } from '../logic/symbol.js';

// 統一日期格式為 YYYY-MM-DD（避免 2026/10/3 這類格式讓「當月」篩選漏掉資料）
export const normDate = (v) => {
    if (!v) return '';
    const m = String(v).trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : String(v).split('T')[0];
};

// 清理代碼格式（轉換為字串，維持純字串；不補零、不轉數字）
export const parseSymbolFromCloud = (sym) => {
    let str = String(sym || '').replace(/^'/, '').trim().toUpperCase();
    return str;
};

// 雲端讀回的資料 → 本機格式（status 不是 success 時原樣回傳，讓呼叫端處理錯誤）
export const fromCloudData = (data) => {
    if (!data || data.status !== 'success') return data;
    return {
        ...data,
        expenses: (data.expenses || []).map(e => ({
            ...e, date: normDate(e.date), paymentDate: normDate(e.paymentDate), settlementDate: normDate(e.settlementDate)
        })),
        stockTrades: (data.stockTrades || []).map(t => ({ ...t, date: normDate(t.date), symbol: parseSymbolFromCloud(t.symbol) }))
    };
};

// 本機資料 → 上傳格式（股票代碼寫入前先清理）
export const toCloudPayload = ({ baseRev, force, expenses, settings, stockTrades }) => ({
    baseRev,
    force: !!force,
    expenses,
    settings,
    stockTrades: stockTrades.map(t => ({ ...t, symbol: cleanSymbol(t.symbol) }))
});
