// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
import { cleanSymbol } from './symbol.js';

// 匯入檔的日期：支援 Excel 日期序號、2026/10/3、2026-10-03；無法辨識回傳 null，空白回傳 ''
export const importDate = (v, ssf) => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000 && ssf && ssf.parse_date_code) {
        const p = ssf.parse_date_code(v);
        if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    }
    const m = String(v).trim().match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null;
};
export const importExpKey = (e) => [e.date, e.category, e.item, String(e.content || ''), Number(e.amount || 0), e.paymentMethod].join('|');
export const importStockKey = (t) => [t.date, t.symbol, t.action, Number(t.shares || 0), Number(t.price || 0)].join('|');
export const importNum = (v) => Number(v === undefined || v === null || v === '' ? 0 : v);
// 解析（不寫入）：標出無效、疑似重複、不符合類別對照表的列
export const buildImportPreview = (expRows, stockRows, existingExp, existingStocks, catItems, today, ssf) => {
    const expCount = {}, stCount = {}, stFirst = {};
    existingExp.forEach(e => { const k = importExpKey(e); expCount[k] = (expCount[k] || 0) + 1; });
    existingStocks.forEach(t => { const k = importStockKey({ ...t, symbol: cleanSymbol(t.symbol) }); stCount[k] = (stCount[k] || 0) + 1; if (!stFirst[k]) stFirst[k] = t.id; });
    const expenses = [], stocks = [];
    expRows.forEach((row, idx) => {
        if (!(row['金額'] || row['項目'])) return;
        const why = [];
        const typeRaw = String(row['收支類型'] || '支出').trim();
        const type = typeRaw === '收入' || typeRaw === '支出' ? typeRaw : null;
        if (!type) why.push('收支類型無法辨識');
        const date = (row['日期'] === undefined || row['日期'] === '') ? today : importDate(row['日期'], ssf);
        if (date === null) why.push('日期無法辨識');
        const amount = importNum(row['金額']), paidAmount = importNum(row['已付金額']);
        if (!isFinite(amount)) why.push('金額不是數字');
        if (!isFinite(paidAmount)) why.push('已付金額不是數字');
        const rec = {
            row: idx + 2, id: row['ID'] || '', stockId: row['關聯股票ID'] || '', type: type || '支出', date: date || '',
            category: String(row['類別'] || '變動支出'), item: String(row['項目'] || '其他'), content: row['內容'] === undefined ? '' : String(row['內容']),
            amount: isFinite(amount) ? amount : 0, paidAmount: isFinite(paidAmount) ? paidAmount : 0, paymentMethod: String(row['付款方式'] || '付現'),
            paymentDate: importDate(row['付款日'], ssf) || '', settlementDate: importDate(row['結算日'], ssf) || '', note: row['備註'] === undefined ? '' : String(row['備註'])
        };
        rec.invalid = why.join('、');
        const allow = catItems[rec.category];
        rec.mismatch = !rec.invalid && !(allow === '*' || (Array.isArray(allow) && allow.includes(rec.item)));
        const k = importExpKey(rec);
        rec.dup = !rec.invalid && (expCount[k] || 0) > 0;
        if (rec.dup) expCount[k]--;
        expenses.push(rec);
    });
    stockRows.forEach((row, idx) => {
        if (!(row['股票代碼'] || row['標的名稱'])) return;
        const why = [];
        const aRaw = String(row['交易類型'] || '買進').trim();
        const action = aRaw === '買進' || aRaw === '賣出' ? aRaw : null;
        if (!action) why.push('交易類型無法辨識');
        const date = (row['交易日期'] === undefined || row['交易日期'] === '') ? today : importDate(row['交易日期'], ssf);
        if (date === null) why.push('日期無法辨識');
        const symbol = cleanSymbol(row['股票代碼']);
        if (!symbol) why.push('缺少股票代碼');
        const price = importNum(row['成交單價']), shares = importNum(row['成交股數']), fee = importNum(row['手續費']), tax = importNum(row['交易稅']);
        if (![price, shares, fee, tax].every(isFinite)) why.push('單價、股數或費用不是數字');
        else if (!(shares > 0)) why.push('成交股數必須大於 0');
        const total = row['總金額'] ? Number(row['總金額']) : (action === '賣出' ? (price * shares) - fee - tax : (price * shares) + fee);
        const rec = { row: idx + 2, id: row['ID'] || '', action: action || '買進', date: date || '', symbol, name: String(row['標的名稱'] || 'ETF標的'), price, shares, fee, tax, totalAmount: isFinite(total) ? total : 0 };
        rec.invalid = why.join('、');
        const k = importStockKey(rec);
        rec.dup = !rec.invalid && (stCount[k] || 0) > 0;
        if (rec.dup) { stCount[k]--; rec.dupOfId = stFirst[k]; }
        stocks.push(rec);
    });
    return { expenses, stocks };
};
