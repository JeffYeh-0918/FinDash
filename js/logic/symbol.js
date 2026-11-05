// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// 股票代碼：只清理，不轉數字、不補零（保留開頭的 00）
export const cleanSymbol = (sym) => {
    return String(sym || '').replace(/^'/, '').replace(/\.(TW|TWO)$/i, '').trim().toUpperCase();
};
