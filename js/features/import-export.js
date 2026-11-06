// FinDash 功能模組：Excel 匯入／匯出
// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（主程式與其他模組的成員）。
import { cleanSymbol } from '../logic/symbol.js';
import { buildImportPreview } from '../logic/importer.js';

const { ref, computed, nextTick } = Vue;

export const useImportExport = (ctx) => {
    const { expenses, stockTrades, todayStr, appSettings, stockExpenseFields, DEFAULT_STOCK_PAY, refreshDynamicOptions, pushToCloud, showToast, captureUndo, armUndo, renderCharts } = ctx;

    const exportToExcel = () => {
        if (typeof XLSX === 'undefined') {
            showToast('Excel 套件還在載入，請稍後再試。', 'error');
            return;
        }
        const wb = XLSX.utils.book_new();
        
        const formatSlashDate = (dateStr) => {
            if (!dateStr) return '';
            return String(dateStr).replace(/-/g, '/');
        };
        const reversedExpenses = [...expenses.value].reverse();
        const expData = reversedExpenses.map(e => ({
            'ID': e.id,
            '收支類型': e.type, 
            '日期': formatSlashDate(e.date), 
            '類別': e.category, 
            '項目': e.item,
            '內容': e.content, 
            '金額': e.amount, 
            '已付金額': e.paidAmount, 
            '付款方式': e.paymentMethod,
            '付款日': formatSlashDate(e.paymentDate), 
            '結算日': formatSlashDate(e.settlementDate),
            '備註': e.note,
            '關聯股票ID': e.stockId || ''
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expData), '日常收支紀錄');

        const reversedStockTrades = [...stockTrades.value].reverse();
        const stockData = reversedStockTrades.map(s => ({
            'ID': s.id,
            '交易類型': s.action, 
            '交易日期': formatSlashDate(s.date), 
            '股票代碼': cleanSymbol(s.symbol), 
            '標的名稱': s.name,
            '成交單價': s.price, 
            '成交股數': s.shares, 
            '手續費': s.fee, 
            '交易稅': s.tax, 
            '總金額': s.totalAmount
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockData), 'ETF股票交易歷史');

        XLSX.writeFile(wb, `FinDash_財務報表_${todayStr()}.xlsx`);
    };
    // （IMPORT 區塊已移到 js/logic/，見檔頭 import）
    const showImportPreviewModal = ref(false);
    const importPreview = ref(null);
    const importSummary = computed(() => {
        const p = importPreview.value;
        if (!p) return null;
        const f = (list) => ({ total: list.length, invalid: list.filter(r => r.invalid).length, dup: list.filter(r => r.dup).length, mismatch: list.filter(r => r.mismatch).length,
            will: list.filter(r => !r.invalid && !(p.skipDup && r.dup)).length });
        return { exp: f(p.expenses), stock: f(p.stocks) };
    });
    const importIssues = computed(() => {
        const p = importPreview.value;
        if (!p) return [];
        const out = [];
        p.expenses.forEach(r => { const why = r.invalid || (r.dup ? '疑似重複（已有相同紀錄）' : (r.mismatch ? `不在類別對照表內（${r.category}／${r.item}）` : '')); if (why) out.push({ key: 'e' + r.row, kind: '收支', row: r.row, text: `${r.date} ${r.item} ${r.amount}`, why, bad: !!r.invalid }); });
        p.stocks.forEach(r => { const why = r.invalid || (r.dup ? '疑似重複（已有相同交易）' : ''); if (why) out.push({ key: 's' + r.row, kind: '股票', row: r.row, text: `${r.date} ${r.action} ${r.symbol} ${r.shares} 股`, why, bad: !!r.invalid }); });
        return out.sort((a, b) => Number(b.bad) - Number(a.bad));
    });
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (typeof XLSX === 'undefined') { showToast('Excel 套件還在載入，請稍後再試。', 'error'); e.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
                const sheetRows = (i) => workbook.SheetNames.length > i ? XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[i]]) : [];
                const p = buildImportPreview(sheetRows(0), sheetRows(1), expenses.value, stockTrades.value, appSettings.value.categoryItems, todayStr(), XLSX.SSF);
                if (!p.expenses.length && !p.stocks.length) { showToast('檔案裡沒有可匯入的資料，請確認欄位名稱（可看「匯入說明」）。', 'error'); return; }
                importPreview.value = { fileName: file.name, ...p, skipDup: true, createLinked: false };
                showImportPreviewModal.value = true;
            } catch (err) {
                console.warn('匯入解析失敗', err);
                showToast('解析檔案失敗，請確認是標準的 XLSX 或 CSV 格式。', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };
    const commitImport = () => {
        const p = importPreview.value;
        if (!p) return;
        const keep = (r) => !r.invalid && !(p.skipDup && r.dup);
        captureUndo();
        const usedExp = new Set(expenses.value.map(e => String(e.id)));
        const usedTrade = new Set(stockTrades.value.map(t => String(t.id)));
        let seq = Date.now();
        const nextId = (used) => { while (used.has(String(seq))) seq++; used.add(String(seq)); return seq++; };
        const idMap = {};
        p.stocks.forEach(r => { if (r.dup && r.dupOfId !== undefined && r.id) idMap[String(r.id)] = r.dupOfId; });   // 重複而被略過的交易：連動收支改指向既有那筆
        const stocksToAdd = p.stocks.filter(keep).map(r => {
            const id = (r.id && !usedTrade.has(String(r.id))) ? r.id : nextId(usedTrade);
            usedTrade.add(String(id));
            if (r.id) idMap[String(r.id)] = id;
            return { id, action: r.action, date: r.date, symbol: r.symbol, name: r.name, price: r.price, shares: r.shares, fee: r.fee, tax: r.tax, totalAmount: r.totalAmount };
        });
        const expToAdd = p.expenses.filter(keep).map(r => {
            const id = (r.id && !usedExp.has(String(r.id))) ? r.id : nextId(usedExp);
            usedExp.add(String(id));
            let stockId = '';
            if (r.stockId) stockId = idMap[String(r.stockId)] !== undefined ? idMap[String(r.stockId)] : (stockTrades.value.some(t => String(t.id) === String(r.stockId)) ? r.stockId : '');
            return { id, type: r.type, date: r.date, category: r.category, item: r.item, content: r.content, amount: r.amount, paidAmount: r.paidAmount, stockId,
                paymentMethod: r.paymentMethod, paymentDate: r.paymentDate, settlementDate: r.settlementDate, note: r.note };
        });
        let linkedN = 0;
        if (p.createLinked) {
            const linkedIds = new Set(expToAdd.filter(e => e.stockId !== '').map(e => String(e.stockId)));
            const fresh = [];
            stocksToAdd.forEach(t => {
                if (linkedIds.has(String(t.id))) return;
                fresh.push({ id: nextId(usedExp), ...stockExpenseFields(t), stockId: t.id, paidAmount: 0, paymentMethod: DEFAULT_STOCK_PAY, paymentDate: '', settlementDate: '' });
            });
            linkedN = fresh.length;
            expToAdd.push(...fresh);
        }
        expenses.value = [...expToAdd, ...expenses.value];
        stockTrades.value = [...stocksToAdd, ...stockTrades.value];
        refreshDynamicOptions();
        pushToCloud();
        showImportPreviewModal.value = false;
        importPreview.value = null;
        armUndo(`已匯入 ${expToAdd.length - linkedN} 筆收支、${stocksToAdd.length} 筆股票` + (linkedN ? `，並產生 ${linkedN} 筆連動收支` : ''));
        nextTick(() => renderCharts());
    };
    const downloadTemplateExcel = () => {
        const wb = XLSX.utils.book_new();
        const sampleExpenses = [
            { 'ID': Date.now(), '收支類型': '支出', '日期': '2026/09/02', '類別': '變動支出', '項目': '飲食費', '內容': '全聯採買', '金額': 1850, '已付金額': 0, '付款方式': '國泰信用卡', '付款日': '2026/09/02', '結算日': '', '備註': '一週食材' }
        ];
        const sampleStocks = [
            { 'ID': Date.now() + 1000, '交易類型': '買進', '交易日期': '2026/03/15', '股票代碼': '0050', '標的名稱': '元大台灣50', '成交單價': 165.0, '成交股數': 2000, '手續費': 142, '交易稅': 0, '總金額': 330142 }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleExpenses), '日常收支紀錄');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sampleStocks), 'ETF股票交易歷史');
        XLSX.writeFile(wb, 'FinDash_匯入範例檔.xlsx');
    };

    return { exportToExcel, showImportPreviewModal, importPreview, importSummary, importIssues, handleFileUpload, commitImport, downloadTemplateExcel };
};
