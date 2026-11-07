// FinDash 功能模組：股票：持股與損益、報價、篩選、交易新增／編輯／刪除、與收支連動
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。
import { cleanSymbol } from '../logic/symbol.js';
import { sortTrades, calcRealized, calcDividends } from '../logic/trades.js';
import { dropHiddenSelection } from '../logic/selection.js';

const { computed, nextTick, watch } = Vue;

export const useStocks = (ctx) => {
    // 取用前面模組已建立的成員
    const {
        stockForm, selectedStockIds, stockTrades, isFetchingPrices, gasApiUrl, api,
        roundTwo, notifyPriceFailure, livePricesMap, lastPriceUpdate, renderCharts, expenses,
        yearsOf, stockSearch, stockFilterSymbols, stockFilterActions, stockFilterYears, stockFilterMonths,
        DEFAULT_STOCK_PAY, editingStockId, todayStr, stockSnap, showStockModal, newExpenseId,
        pushToCloud, withUndo, askConfirm, captureUndo, armUndo
    } = ctx;

    const calculatedStockTotal = computed(() => {
        const price = Number(stockForm.value.price || 0);
        const shares = Number(stockForm.value.shares || 0);
        const fee = Number(stockForm.value.fee || 0);
        const tax = Number(stockForm.value.tax || 0);
        return stockForm.value.action === '買進' ? (price * shares) + fee : (price * shares) - fee - tax;
    });
    const selectedStockStats = computed(() => {
        const ids = new Set(selectedStockIds.value.map(String));
        const r = { n: 0, buyN: 0, buyShares: 0, buyAmt: 0, sellN: 0, sellShares: 0, sellAmt: 0, fee: 0, tax: 0, hidden: 0 };
        const visible = new Set(filteredStockTrades.value.map(t => String(t.id)));
        stockTrades.value.forEach(t => {
            if (!ids.has(String(t.id))) return;
            r.n++;
            if (!visible.has(String(t.id))) r.hidden++;
            const shares = Number(t.shares || 0), amt = Number(t.totalAmount || 0);
            if (t.action === '賣出') { r.sellN++; r.sellShares += shares; r.sellAmt += amt; } else { r.buyN++; r.buyShares += shares; r.buyAmt += amt; }
            r.fee += Number(t.fee || 0); r.tax += Number(t.tax || 0);
        });
        return r;
    });
    const fetchStockPrices = async (silent = false) => {
        const symbols = Array.from(new Set(stockTrades.value.map(t => cleanSymbol(t.symbol)).filter(Boolean)));
        if (symbols.length === 0 || isFetchingPrices.value) return;
        isFetchingPrices.value = true;
        const got = {};
        // 1) 優先：經由自己的 GAS 取得「盤中即時價」（TWSE 即時 → Yahoo 備援）
        if (gasApiUrl.value) {
            try {
                const data = await api.fetchPrices(gasApiUrl.value, symbols);
                if (data.status === 'success' && data.prices) {
                    Object.entries(data.prices).forEach(([sym, p]) => {
                        const price = Number(p && p.price);
                        if (price > 0) got[cleanSymbol(sym)] = {
                            price: roundTwo(price), isLive: !!p.isLive, source: p.source || '即時報價',
                            time: p.time || '', fetchedAt: Date.now()
                        };
                    });
                }
            } catch (e) {
                console.warn('GAS 即時報價失敗', e);
            }
        }
        // 2) 備援：FinMind「收盤價」（只有收盤後的日資料，不是即時價）
        const startDateObj = new Date();
        startDateObj.setDate(startDateObj.getDate() - 10);
        const startDateStr = startDateObj.toISOString().split('T')[0];
        for (const sym of symbols.filter(x => !got[x])) {
            try {
                const data = await api.fetchFinMindClose(sym, startDateStr);
                if (data) {
                    if (data.data && data.data.length > 0) {
                        const latest = data.data[data.data.length - 1];
                        const closePrice = Number(latest.close);
                        if (!isNaN(closePrice) && closePrice > 0) {
                            got[sym] = { price: roundTwo(closePrice), isLive: false, source: 'FinMind 收盤價', time: latest.date, fetchedAt: Date.now() };
                        }
                    }
                }
            } catch (e) {
                console.warn(`抓取 ${sym} 股價失敗`, e);
            }
        }
        const missing = symbols.filter(x => !got[x]);
        if (missing.length) notifyPriceFailure(missing, silent);
        livePricesMap.value = { ...livePricesMap.value, ...got };
        isFetchingPrices.value = false;
        const now = new Date();
        lastPriceUpdate.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        nextTick(() => renderCharts());
    };
    // 台股盤中（週一至週五 09:00–13:30，台北時間）才自動輪詢報價
    const isMarketOpen = () => {
        const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
        const mins = t.getHours() * 60 + t.getMinutes();
        return t.getDay() >= 1 && t.getDay() <= 5 && mins >= 540 && mins <= 815;
    };
    const stockHoldings = computed(() => {
        const map = {};
        const sortedTrades = sortTrades(stockTrades.value);
        sortedTrades.forEach(t => {
            const sym = cleanSymbol(t.symbol);
            if (!map[sym]) map[sym] = { symbol: sym, name: t.name, shares: 0, totalCost: 0 };
            
            const shares = Number(t.shares || 0);
            const totalAmount = Number(t.totalAmount || 0);
            if (t.action === '買進') {
                map[sym].shares += shares;
                map[sym].totalCost += totalAmount;
            } else if (t.action === '賣出') {
                if (map[sym].shares > 0) {
                    const currentAvgCost = map[sym].totalCost / map[sym].shares;
                    map[sym].shares -= shares;
                    map[sym].totalCost -= (currentAvgCost * shares);
                    if (map[sym].shares <= 0) {
                        map[sym].shares = 0;
                        map[sym].totalCost = 0;
                    }
                }
            }
        });
        return Object.values(map).filter(h => h.shares > 0).map(h => {
            const avgCost = h.shares > 0 ? (h.totalCost / h.shares) : 0;
            const liveInfo = livePricesMap.value[h.symbol];
            const currentPrice = (liveInfo && liveInfo.price) ? liveInfo.price : avgCost;
            const isLive = !!(liveInfo && liveInfo.isLive && liveInfo.fetchedAt && (Date.now() - liveInfo.fetchedAt) < 30 * 60 * 1000);
            const isStale = !!liveInfo && !isLive;   // 有價格但不是新鮮的即時價（舊價或收盤價）
            const priceSource = liveInfo ? ((liveInfo.source || '') + (liveInfo.time ? ' ' + liveInfo.time : '')) : '尚無市價（暫以平均成本估算）';
            const marketValue = h.shares * currentPrice;
            const unrealizedPL = marketValue - h.totalCost;
            const unrealizedPLRate = h.totalCost > 0 ? ((unrealizedPL / h.totalCost) * 100).toFixed(2) : '0.00';
            return {
                ...h,
                currentPrice: roundTwo(currentPrice),
                avgCost: roundTwo(avgCost),
                marketValue: roundTwo(marketValue),
                unrealizedPL: roundTwo(unrealizedPL),
                dividends: roundTwo(dividendBySymbol.value[h.symbol] || 0),
                totalPL: roundTwo(unrealizedPL + (dividendBySymbol.value[h.symbol] || 0)),
                totalPLRate: h.totalCost > 0 ? (((unrealizedPL + (dividendBySymbol.value[h.symbol] || 0)) / h.totalCost) * 100).toFixed(2) : '0.00',
                unrealizedPLRate,
                isLive,
                isStale,
                priceSource
            };
        });
    });
    const totalInvestmentMarketValue = computed(() => stockHoldings.value.reduce((s, h) => s + h.marketValue, 0));
    const totalUnrealizedPL = computed(() => stockHoldings.value.reduce((s, h) => s + h.unrealizedPL, 0));
    const totalUnrealizedPLRate = computed(() => {
        const cost = stockHoldings.value.reduce((s, h) => s + h.totalCost, 0);
        return cost === 0 ? '0.00' : ((totalUnrealizedPL.value / cost) * 100).toFixed(2);
    });
    const realizedInfo = computed(() => calcRealized(stockTrades.value));
    const totalRealizedPL = computed(() => roundTwo(realizedInfo.value.total));
    const realizedRowsDesc = computed(() => [...realizedInfo.value.rows].reverse());
    const realizedBySymbolList = computed(() => Object.entries(realizedInfo.value.by).map(([symbol, gain]) => ({ symbol, gain })));
    const dividendBySymbol = computed(() => calcDividends(expenses.value));
    const totalDividend = computed(() => roundTwo(Object.values(dividendBySymbol.value).reduce((a, b) => a + b, 0)));
    const stockSymbolOptions = computed(() => {
        const m = {};
        stockTrades.value.forEach(t => { const sym = cleanSymbol(t.symbol); if (sym && !m[sym]) m[sym] = t.name || ''; });
        return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])).map(([symbol, name]) => ({ symbol, name }));
    });
    const stockYearOptions = computed(() => yearsOf(stockTrades.value));
    const filteredStockTrades = computed(() => {
        const kw = (stockSearch.value || '').trim().toLowerCase();
        return stockTrades.value.filter(t => {
            const sym = cleanSymbol(t.symbol);
            const d = String(t.date || '');
            return (!kw || sym.toLowerCase().includes(kw) || String(t.name || '').toLowerCase().includes(kw))
                && (stockFilterSymbols.value.length === 0 || stockFilterSymbols.value.includes(sym))
                && (stockFilterActions.value.length === 0 || stockFilterActions.value.includes(t.action))
                && (stockFilterYears.value.length === 0 || stockFilterYears.value.includes(d.slice(0, 4)))
                && (stockFilterMonths.value.length === 0 || stockFilterMonths.value.includes(String(parseInt(d.slice(5, 7), 10))));
        });
    });
    const stockFilterActive = computed(() => !!(stockSearch.value || stockFilterSymbols.value.length || stockFilterActions.value.length || stockFilterYears.value.length || stockFilterMonths.value.length));
    const resetStockFilters = () => { selectedStockIds.value = []; stockSearch.value = ''; stockFilterSymbols.value = []; stockFilterActions.value = []; stockFilterYears.value = []; stockFilterMonths.value = []; };
    watch(filteredStockTrades, (list) => dropHiddenSelection(selectedStockIds, list));
    const stockYearSelectOptions = computed(() => stockYearOptions.value.map(y => ({ value: y, label: `${y} 年` })));
    const stockSymbolSelectOptions = computed(() => stockSymbolOptions.value.map(o => ({ value: o.symbol, label: `${o.symbol} ${o.name}`.trim() })));
    const stockActionSelectOptions = [{ value: '買進', label: '買進' }, { value: '賣出', label: '賣出' }];
    const isAllStocksSelected = computed(() => filteredStockTrades.value.length > 0 && selectedStockIds.value.length === filteredStockTrades.value.length);
    const toggleSelectAllStocks = (e) => { selectedStockIds.value = e.target.checked ? filteredStockTrades.value.map(s => s.id) : []; };
    // 記股票自動帶出收支時的預設付款方式
    const lastStockPay = () => DEFAULT_STOCK_PAY;
    const stockExpenseFields = (t) => ({
        type: t.action === '賣出' ? '收入' : '支出',
        date: t.date,
        category: '投資儲蓄',
        item: t.action === '賣出' ? 'ETF賣出' : 'ETF投資',
        content: cleanSymbol(t.symbol),
        amount: Number(t.totalAmount || 0),
        note: `${t.price}*${t.shares}`
    });
    const findLinkedExpense = (tradeId) => expenses.value.find(e => e.stockId !== undefined && e.stockId !== '' && String(e.stockId) === String(tradeId));
    // 舊資料：找「同日、同方向、代碼相同、金額相符」且尚未連動的既有收支
    const findMatchingExpense = (t, taken) => expenses.value.find(e => !e.stockId && !taken.has(e.id)
        && e.date === t.date && e.type === (t.action === '賣出' ? '收入' : '支出')
        && cleanSymbol(e.content) === cleanSymbol(t.symbol)
        && Math.abs(Number(e.amount || 0) - Number(t.totalAmount || 0)) <= 1);
    const openStockModal = (trade = null) => {
        if (trade) {
            editingStockId.value = trade.id;
            const linked = findLinkedExpense(trade.id) || findMatchingExpense(trade, new Set());
            stockForm.value = { ...trade, symbol: cleanSymbol(trade.symbol), payMethod: linked ? (linked.paymentMethod || '') : lastStockPay() };
        } else {
            editingStockId.value = null;
            stockForm.value = { action: '買進', date: todayStr(), symbol: '0050', name: '元大台灣50', price: null, shares: null, fee: 0, tax: 0, payMethod: lastStockPay() };
        }
        stockSnap.value = JSON.stringify(stockForm.value);
        showStockModal.value = true;
    };
    const saveStockTradeSubmit = () => {
        const { payMethod, ...form } = stockForm.value;
        const data = {
            ...form,
            symbol: cleanSymbol(form.symbol),
            price: Number(form.price || 0),
            shares: Number(form.shares || 0),
            fee: Number(form.fee || 0),
            tax: Number(form.tax || 0),
            totalAmount: calculatedStockTotal.value
        };
        let tradeId;
        if (editingStockId.value) {
            tradeId = editingStockId.value;
            const idx = stockTrades.value.findIndex(t => t.id === tradeId);
            if (idx !== -1) stockTrades.value[idx] = { id: tradeId, ...data };
        } else {
            tradeId = Date.now();
            stockTrades.value.unshift({ id: tradeId, ...data });
        }
        // 自動補上／更新對應的收支紀錄
        const trade = { id: tradeId, ...data };
        const fields = stockExpenseFields(trade);
        const linked = findLinkedExpense(tradeId) || findMatchingExpense(trade, new Set());
        if (linked) {
            Object.assign(linked, fields, { stockId: tradeId, paymentMethod: payMethod || '' });
        } else {
            expenses.value.unshift({ id: newExpenseId(), ...fields, stockId: tradeId, paidAmount: 0, paymentMethod: payMethod || '', paymentDate: '', settlementDate: '' });
        }
        showStockModal.value = false;
        pushToCloud();
        nextTick(() => renderCharts());
    };
    const confirmDeleteStockTrade = (trade) => {
        const hasLink = !!findLinkedExpense(trade.id);
        {   // 單筆刪除不再詢問，改以「復原」提示補救
            withUndo(hasLink ? '已刪除 1 筆股票交易與對應收支' : '已刪除 1 筆股票交易', () => {
                stockTrades.value = stockTrades.value.filter(t => t.id !== trade.id);
                expenses.value = expenses.value.filter(e => String(e.stockId) !== String(trade.id));
            });
            pushToCloud();
            nextTick(() => renderCharts());
        }
    };
    const confirmBatchDeleteStockTrades = async () => {
        const ids = new Set(selectedStockIds.value.map(String));
        const linkedN = expenses.value.filter(e => e.stockId !== undefined && e.stockId !== '' && ids.has(String(e.stockId))).length;
        if (await askConfirm({ title: '批次刪除', message: `確定要刪除勾選的 ${selectedStockIds.value.length} 筆股票紀錄？` + (linkedN ? `\n（對應的 ${linkedN} 筆收支紀錄也會一併刪除）` : '') + '\n刪除後 10 秒內可以復原。', confirmText: '刪除', danger: true })) {
            withUndo(`已刪除 ${selectedStockIds.value.length} 筆股票交易` + (linkedN ? `與 ${linkedN} 筆收支` : ''), () => {
                stockTrades.value = stockTrades.value.filter(t => !ids.has(String(t.id)));
                expenses.value = expenses.value.filter(e => !(e.stockId !== undefined && e.stockId !== '' && ids.has(String(e.stockId))));
            });
            selectedStockIds.value = [];
            pushToCloud();
            nextTick(() => renderCharts());
        }
    };
    // 工具：檢查並補齊「股票交易 ↔ 收支」的連動（不只看連動記號，還會核對實際內容）
    //   ① 股票交易 ID 重複 → 重新編號
    //   ② 連動記號指向「完全不相干」的收支（日期、代碼、金額都對不上，疑似 ID 衝突）→ 該交易重新編號，並補建／連結自己的收支
    //   ③ 沒有收支 → 找得到相符的既有收支就連結，否則新增
    //   ④ 已連動、但類別／項目／備註等與股票交易不一致 → 統一成標準格式（付款方式、已付金額、付款日、結算日不動）
    const stockDiffers = (e, std) => e.type !== std.type || e.date !== std.date || e.category !== std.category || e.item !== std.item
        || cleanSymbol(e.content) !== std.content || Math.abs(Number(e.amount || 0) - std.amount) > 1 || String(e.note || '') !== std.note;
    const looksSimilar = (e, std) => cleanSymbol(e.content) === std.content || e.date === std.date || Math.abs(Number(e.amount || 0) - std.amount) <= 1;
    const syncLegacyStockExpenses = async () => {
        const seenIds = new Set();
        const dupTrades = [];
        stockTrades.value.forEach(t => { const k = String(t.id); if (seenIds.has(k)) dupTrades.push(t); else seenIds.add(k); });
        const reid = new Set(dupTrades);   // 需要重新編號的交易
        const badLinks = [];
        const taken = new Set();
        const plan = [];       // 需要新增或連結
        const fixes = [];      // 已連動但格式不一致
        let okN = 0;
        stockTrades.value.forEach(t => {
            const std = stockExpenseFields(t);
            let linked = reid.has(t) ? null : findLinkedExpense(t.id);
            if (linked && !looksSimilar(linked, std)) { badLinks.push(t); reid.add(t); linked = null; }
            if (linked) {
                if (stockDiffers(linked, std)) fixes.push({ t, e: linked }); else okN++;
                return;
            }
            const m = findMatchingExpense(t, taken);
            if (m) taken.add(m.id);
            plan.push({ t, m });
        });
        const linkN = plan.filter(p => p.m).length;
        const newN = plan.length - linkN;
        if (plan.length === 0 && fixes.length === 0 && reid.size === 0) {
            await askConfirm({ title: '檢查完成', message: `${stockTrades.value.length} 筆股票交易都有對應的收支紀錄，內容也一致。\n\n如果某筆收支看不到，請確認「日常收支」的類別篩選（標準類別為「投資儲蓄」）與交易日篩選。`, confirmText: '知道了', hideCancel: true });
            return;
        }
        const lines = [`共 ${stockTrades.value.length} 筆股票交易，檢查結果：`, `・已連動且內容一致：${okN} 筆`];
        if (dupTrades.length) lines.push(`・交易 ID 重複，將重新編號：${dupTrades.length} 筆`);
        if (badLinks.length) lines.push(`・連動記號指向不相干的收支（疑似 ID 衝突），將重新編號並補建收支：${badLinks.length} 筆`);
        if (linkN) lines.push(`・找到相符的既有收支並連結（同時統一成標準格式）：${linkN} 筆`);
        if (newN) lines.push(`・找不到收支，將新增（付款方式「${DEFAULT_STOCK_PAY}」）：${newN} 筆`);
        if (fixes.length) lines.push(`・已連動但內容與股票交易不一致，將統一格式：${fixes.length} 筆`);
        const sample = [...plan.map(p => p.t), ...fixes.map(f => f.t)].slice(0, 5);
        if (sample.length) lines.push('', '涉及的交易（最多列 5 筆）：', ...sample.map(t => `  ${t.date} ${t.action} ${cleanSymbol(t.symbol)} ${t.name || ''}`));
        lines.push('', '要執行嗎？（執行後 10 秒內可復原）');
        if (!(await askConfirm({ title: '股票交易與收支檢查', message: lines.join('\n'), confirmText: '執行' }))) return;
        captureUndo();
        const usedIds = new Set(stockTrades.value.map(t => String(t.id)));
        expenses.value.forEach(e => { if (e.stockId !== undefined && e.stockId !== '') usedIds.add(String(e.stockId)); });
        let nextTradeId = Date.now() + 100000;
        reid.forEach(t => { while (usedIds.has(String(nextTradeId))) nextTradeId++; t.id = nextTradeId; usedIds.add(String(nextTradeId)); });
        const fresh = [];
        plan.forEach(({ t, m }) => {
            const std = stockExpenseFields(t);
            if (m) Object.assign(m, std, { stockId: t.id });
            else fresh.push({ id: newExpenseId(fresh.map(x => x.id)), ...std, stockId: t.id, paidAmount: 0, paymentMethod: DEFAULT_STOCK_PAY, paymentDate: '', settlementDate: '' });
        });
        fixes.forEach(({ t, e }) => Object.assign(e, stockExpenseFields(t)));
        expenses.value = [...fresh, ...expenses.value];
        pushToCloud();
        armUndo(`已連結 ${linkN} 筆、新增 ${newN} 筆、統一格式 ${fixes.length} 筆` + (reid.size ? `、重新編號 ${reid.size} 筆` : ''));
        nextTick(() => renderCharts());
    };

    return {
        calculatedStockTotal, selectedStockStats, fetchStockPrices, isMarketOpen, stockHoldings, totalInvestmentMarketValue,
        totalUnrealizedPL, totalUnrealizedPLRate, realizedInfo, totalRealizedPL, realizedRowsDesc, realizedBySymbolList,
        totalDividend, stockSymbolOptions, stockYearOptions, filteredStockTrades, stockFilterActive, resetStockFilters,
        stockYearSelectOptions, stockSymbolSelectOptions, stockActionSelectOptions, isAllStocksSelected, toggleSelectAllStocks, stockExpenseFields,
        openStockModal, saveStockTradeSubmit, confirmDeleteStockTrade, confirmBatchDeleteStockTrades, syncLegacyStockExpenses
    };
};
