// 唯一與外部溝通的地方：Google Apps Script 後端、以及 FinMind 備援報價。
// 之後換資料庫，只要重寫這支（與 convert.js），回傳的形狀維持：
//   fetchAll  → { status:'success', rev, expenses, stockTrades, settings } 或 { status:'error', message }
//   pushAll   → { status:'success', rev } | { status:'conflict' } | { status:'shrink', cloudCount, newCount } | { status:'error', message }
//   fetchPrices → { status:'success', prices:{ 代碼:{ price, isLive, source, time } } }
import { fromCloudData, toCloudPayload } from './convert.js';

// 在網址後面加參數，並附上時間戳避免被快取
export const buildUrl = (base, query) => base + (base.includes('?') ? '&' : '?') + query + '&_=' + Date.now();

export const createApi = ({ fetchImpl } = {}) => {
    const doFetch = (...args) => (fetchImpl ? fetchImpl(...args) : globalThis.fetch(...args));
    return {
        // 讀取全部資料
        async fetchAll(baseUrl) {
            const res = await doFetch(buildUrl(baseUrl, 'action=data'), { method: 'GET', redirect: 'follow' });
            return fromCloudData(await res.json());
        },
        // 寫入全部資料（args：baseRev、force、expenses、settings、stockTrades）
        async pushAll(baseUrl, args) {
            const res = await doFetch(baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 不觸發 CORS 預檢，且能讀回結果
                redirect: 'follow',
                body: JSON.stringify(toCloudPayload(args))
            });
            return await res.json();
        },
        // 經由自己的後端取得即時報價
        async fetchPrices(baseUrl, symbols) {
            const res = await doFetch(buildUrl(baseUrl, 'action=prices&symbols=' + encodeURIComponent(symbols.join(','))), { redirect: 'follow' });
            return await res.json();
        },
        // 備援：FinMind 收盤價；請求失敗回傳 null
        async fetchFinMindClose(sym, startDate) {
            const res = await doFetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${sym}&start_date=${startDate}`);
            if (!res.ok) return null;
            return await res.json();
        }
    };
};
