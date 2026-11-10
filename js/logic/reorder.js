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

// ---------- V18：指標式拖曳用（Pointer Events；手機、平板、電腦共用）----------
// view＝目前篩選後的清單（陣列）；groupIds＝要搬的紀錄 id；beforeId＝放在哪一筆「之前」（null＝放到清單最後）。
// 規則：被搬的紀錄保持原本的相對順序，整疊插到 beforeId 之前；篩選掉看不到的紀錄位置不動；永遠只調順序、不增不減。
// 順序沒有變時回傳原本的 full（同一個陣列），讓呼叫端可以略過存檔與重繪。
export const moveGroup = (full, view, groupIds, beforeId) => {
    const gs = new Set((groupIds || []).map(String));
    if (!gs.size) return full;
    const idOf = (x) => String(x.id);
    // 錨點：beforeId 若本身就在被搬的那疊裡，往後找第一筆「不在那疊」的紀錄
    let anchor = beforeId === null || beforeId === undefined ? null : String(beforeId);
    if (anchor !== null && gs.has(anchor)) {
        const at = view.findIndex(x => idOf(x) === anchor);
        anchor = null;
        for (let i = at + 1; at >= 0 && i < view.length; i++) { if (!gs.has(idOf(view[i]))) { anchor = idOf(view[i]); break; } }
    }
    const group = full.filter(x => gs.has(idOf(x)));
    if (!group.length) return full;
    const rest = full.filter(x => !gs.has(idOf(x)));
    let at;
    if (anchor !== null) {
        at = rest.findIndex(x => idOf(x) === anchor);
        if (at < 0) return full;
    } else {
        // 放到最後：接在畫面清單中最後一筆「不在那疊」的紀錄後面
        let lastId = null;
        for (let i = view.length - 1; i >= 0; i--) { if (!gs.has(idOf(view[i]))) { lastId = idOf(view[i]); break; } }
        if (lastId === null) return full;
        at = rest.findIndex(x => idOf(x) === lastId) + 1;
        if (at <= 0) return full;
    }
    const out = [...rest.slice(0, at), ...group, ...rest.slice(at)];
    return out.every((x, i) => x === full[i]) ? full : out;
};
