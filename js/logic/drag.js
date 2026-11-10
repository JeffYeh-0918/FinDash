// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// 拖曳排序的幾何與判斷：放下的位置、自動捲動速度、哪些紀錄一起搬、這個位置放下會不會其實沒變動。

// 指標在 y：插入「第 slot 列之前」（0～n；n＝最後一列之後）。mids＝每一列的垂直中心，由上到下。
export const slotFromY = (mids, y) => {
    for (let i = 0; i < mids.length; i++) if (y < mids[i]) return i;
    return mids.length;
};

// 靠近上緣／下緣時的自動捲動：回傳「這一格要捲幾像素」（負＝往上，正＝往下，0＝不捲）。越靠近邊緣越快。
export const edgeScrollDelta = (pos, lo, hi, zone = 64, maxSpeed = 18) => {
    if (!(hi > lo) || zone <= 0) return 0;
    const z = Math.min(zone, (hi - lo) / 2);
    if (pos < lo + z) { const k = Math.min(1, (lo + z - pos) / z); return -Math.max(1, Math.round(maxSpeed * k * k)); }
    if (pos > hi - z) { const k = Math.min(1, (pos - (hi - z)) / z); return Math.max(1, Math.round(maxSpeed * k * k)); }
    return 0;
};

// 移動超過門檻（像素）才算「開始拖」
export const movedBeyond = (dx, dy, px) => Math.hypot(dx, dy) > px;

// 拖的這一筆若已勾選，所有「目前篩選結果中已勾選」的一起搬；沒勾選就只搬這一筆
export const groupIdsFor = (draggedId, selectedIds, viewIds) => {
    const sel = new Set((selectedIds || []).map(String));
    const d = String(draggedId);
    return sel.has(d) ? (viewIds || []).map(String).filter(id => sel.has(id)) : [d];
};

// 放在第 slot 列之前，其實順序不會變？（那疊是連續的、而且 slot 就在那疊本身的範圍內）
export const isNoopSlot = (viewIds, groupIds, slot) => {
    const gs = new Set((groupIds || []).map(String));
    const idx = []; (viewIds || []).forEach((id, i) => { if (gs.has(String(id))) idx.push(i); });
    if (!idx.length) return true;
    const first = idx[0], last = idx[idx.length - 1];
    if (last - first + 1 !== idx.length) return false;   // 勾選的不連續：放下會把它們併在一起，一定有變動
    return slot >= first && slot <= last + 1;
};
