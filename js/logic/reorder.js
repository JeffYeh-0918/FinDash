// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// 拖曳排序：被拖的列若已勾選，所有「目前畫面上、已勾選」的列會一起搬到目標位置；
// 若沒勾選就只搬這一列。永遠只調整順序，不增不減（即使畫面是篩選後的清單）。
export const reorderWithGroup = (full, view, fromIdx, toIdx, selectedIds) => {
    const dragged = view[fromIdx], target = view[toIdx];
    if (!dragged || !target || String(dragged.id) === String(target.id)) return full;
    const sel = new Set((selectedIds || []).map(String));
    const group = sel.has(String(dragged.id)) ? view.filter(x => sel.has(String(x.id))) : [dragged];
    const groupIds = new Set(group.map(x => String(x.id)));
    if (groupIds.has(String(target.id))) return full;   // 放到自己人身上 → 不動
    const rest = full.filter(x => !groupIds.has(String(x.id)));
    const at = rest.findIndex(x => String(x.id) === String(target.id));
    rest.splice(fromIdx < toIdx ? at + 1 : at, 0, ...group);
    return rest;
};
