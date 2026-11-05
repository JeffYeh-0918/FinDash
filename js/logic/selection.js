// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// 篩選條件改變後，已經不在目前清單裡的勾選自動取消（合計也跟著更新）
export const dropHiddenSelection = (selRef, list) => {
    if (!selRef.value.length) return;
    const vis = new Set(list.map(x => String(x.id)));
    const keep = selRef.value.filter(id => vis.has(String(id)));
    if (keep.length !== selRef.value.length) selRef.value = keep;
};
