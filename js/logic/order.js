// FinDash 純邏輯模組（不依賴畫面、Vue、瀏覽器），可直接用 Node 測試。
// V22：清單依「日期」排序（新的在上），同一天內維持陣列裡的相對順序（不動每日內的順序）。
//   · 顯示：sortByDateDesc（穩定排序；沒填日期的排最後）
//   · 新增／複製／匯入／改日期：insertAtDayStart、putRecord → 排在「當天最上面」（同一天內越上面越新）
//   · 拖曳：moveToDay → 整疊改成「放開位置所在那一天」的日期，並放在當天指定位置
const dateKey = (x) => String((x && x.date) || '');
const idOf = (x) => String(x.id);

// 穩定排序：日期新→舊；同日維持原本順序；沒填日期的排最後
export const sortByDateDesc = (list) => list
    .map((x, i) => [x, i])
    .sort((a, b) => {
        const da = dateKey(a[0]), db = dateKey(b[0]);
        if (da === db) return a[1] - b[1];
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? 1 : -1;
    })
    .map(p => p[0]);

// 把紀錄插到「同一天最上面」（同日期的第一筆之前）；該日期還沒有紀錄就放最前面（顯示時會自動排進正確位置）。
// 一次插入多筆時，彼此的先後順序維持不變。
export const insertAtDayStart = (list, items) => {
    const out = list.slice();
    const arr = Array.isArray(items) ? items : [items];
    for (let k = arr.length - 1; k >= 0; k--) {
        const d = dateKey(arr[k]);
        const at = out.findIndex(x => dateKey(x) === d);
        out.splice(at < 0 ? 0 : at, 0, arr[k]);
    }
    return out;
};

// 更新一筆紀錄：日期沒變就原地更新（位置不動）；日期變了就搬到新日期當天的最上面
export const putRecord = (list, id, updated) => {
    const i = list.findIndex(x => idOf(x) === String(id));
    if (i < 0) return list;
    if (dateKey(list[i]) === dateKey(updated)) { const out = list.slice(); out[i] = updated; return out; }
    const rest = list.slice(); rest.splice(i, 1);
    return insertAtDayStart(rest, updated);
};

// 股票連動的收支：不能單獨改日期，只有「跟被拖那張不同天」才算被鎖住
export const isLinkedOtherDay = (x, day) => x.stockId !== undefined && x.stockId !== null && x.stockId !== '' && dateKey(x) !== day;

// 整疊拖曳：把已勾選的紀錄全部改成 day（＝放開位置所在的那一天），並放在這一天「beforeId 之前」（null／不在這天＝這天可見的最後面）。
// view＝目前畫面清單（已排序）；回傳 { list, dateChanged }；完全沒變動時 list 就是原本的 full（同一個陣列）。
export const moveToDay = (full, view, groupIds, beforeId, day) => {
    const gs = new Set((groupIds || []).map(String));
    if (!gs.size || !day) return { list: full, dateChanged: [] };
    const viewGroup = view.filter(x => gs.has(idOf(x)));
    if (!viewGroup.length) return { list: full, dateChanged: [] };
    const gset = new Set(viewGroup.map(idOf));
    const dateChanged = viewGroup.filter(x => dateKey(x) !== day).map(idOf);
    const moved = viewGroup.map(x => (dateKey(x) === day ? x : { ...x, date: day }));
    const viewIds = new Set(view.map(idOf));
    const dayRest = full.filter(x => dateKey(x) === day && !gset.has(idOf(x)));

    // 預設放在這天「畫面上看得到的」最後一筆之後（篩選掉的紀錄位置不動）
    let at = 0;
    dayRest.forEach((x, i) => { if (viewIds.has(idOf(x))) at = i + 1; });
    if (beforeId !== null && beforeId !== undefined) {
        let anchor = String(beforeId);
        if (gset.has(anchor)) {   // 錨點本身就在被搬的那疊裡：往後找第一筆不在那疊的
            const k = view.findIndex(x => idOf(x) === anchor);
            anchor = null;
            for (let i = k + 1; k >= 0 && i < view.length; i++) { if (!gset.has(idOf(view[i]))) { anchor = idOf(view[i]); break; } }
        }
        if (anchor !== null) { const j = dayRest.findIndex(x => idOf(x) === anchor); if (j >= 0) at = j; }
    }
    const newDay = [...dayRest.slice(0, at), ...moved, ...dayRest.slice(at)];
    const out = []; let placed = false;
    for (const x of full) {
        if (gset.has(idOf(x)) || dateKey(x) === day) { if (!placed) { out.push(...newDay); placed = true; } continue; }
        out.push(x);
    }
    if (!placed) out.unshift(...newDay);
    if (!dateChanged.length && out.length === full.length && out.every((x, i) => x === full[i])) return { list: full, dateChanged };
    return { list: out, dateChanged };
};

// 股票交易被改了日期：對應的收支（以 stockId 連動）也跟著改日期，並排到新日期當天的最上面。回傳新陣列（沒有要改的就回傳原本那個）
export const retargetLinked = (expenses, tradeIds, day) => {
    const ids = new Set((tradeIds || []).map(String));
    let list = expenses;
    expenses.forEach(e => {
        if (e.stockId !== undefined && e.stockId !== null && e.stockId !== '' && ids.has(String(e.stockId)) && dateKey(e) !== day) {
            list = putRecord(list, e.id, { ...e, date: day });
        }
    });
    return list;
};
