import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// ---- 假瀏覽器環境：只做到足以驅動手勢與拖曳的程度 ----
const listeners = {};      // window 事件
const addL = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
const rmL = (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); };
const fire = (t, ev) => { (listeners[t] || []).slice().forEach(f => f(ev)); };
const mkEl = () => {
    const el = { style: {}, dataset: {}, children: [], _cls: new Set(), textContent: '', attrs: {}, removed: false,
        classList: { add: (c) => el._cls.add(c), remove: (c) => el._cls.delete(c), toggle: (c, on) => (on ? el._cls.add(c) : el._cls.delete(c)), contains: (c) => el._cls.has(c) },
        appendChild: (c) => { el.children.push(c); return c; }, remove: () => { el.removed = true; }, setAttribute: (k, v) => { el.attrs[k] = v; },
        cloneNode: () => mkEl(), querySelector: () => null, getClientRects: () => [1], getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 40, bottom: 40 }), animate: () => ({}) };
    Object.defineProperty(el, 'className', { get: () => [...el._cls].join(' '), set: (v) => { el._cls = new Set(String(v).split(' ').filter(Boolean)); } });
    return el;
};
let rows = [], rafQ = [], body = mkEl();
globalThis.window = { addEventListener: addL, removeEventListener: rmL, innerHeight: 800, scrollY: 0, scrollBy() {} };
globalThis.document = { body, createElement: mkEl, querySelector: () => null, querySelectorAll: () => rows };
globalThis.getComputedStyle = () => ({ overflowY: 'visible' });
globalThis.requestAnimationFrame = (f) => { rafQ.push(f); return rafQ.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.Vue = { ref: v => ({ value: v }), computed: fn => ({ get value() { return fn(); } }), nextTick: f => f() };
const { useCardDrag } = await import('../js/features/card-drag.js');

// 假的列：第 i 列高 40px，中心 = i*40+20
const mkRows = (kind, ids) => { rows = ids.map((id, i) => { const el = mkEl(); el.dataset.fdRow = ''; el.dataset.fdKind = kind; el.dataset.fdId = String(id); el.dataset.fdLabel = '項目' + id; el.dataset.fdAmt = '-' + id; el.getBoundingClientRect = () => ({ left: 10, top: i * 40, width: 300, height: 40, bottom: i * 40 + 40 }); return el; }); return rows; };
const flush = () => { const q = rafQ; rafQ = []; q.forEach(f => f()); };
const D0 = '2026-11-15';   // 預設：所有紀錄同一天（V22 起拖曳只能在同一天內調整）
const setup = (ids = [1, 2, 3, 4, 5], selected = [], dates = [], extra = {}) => {
    const exp = ids.map((id, i) => ({ id, date: dates[i] || D0, ...(extra.stockIds && extra.stockIds[i] ? { stockId: extra.stockIds[i] } : {}) })), pushed = [], undo = [], toasts = [];
    const ctx = { selectedExpenseIds: { value: selected }, selectedStockIds: { value: [] }, expenses: { value: exp }, stockTrades: { value: [] }, filteredExpenses: { value: exp }, filteredStockTrades: { value: [] },
        pushToCloud: () => pushed.push(1), renderCharts: () => {}, captureUndo: () => undo.push(1), armUndo: (m) => toasts.push(m),
        fdmToggleSel: (k, id) => { const r = k === 'stock' ? ctx.selectedStockIds : ctx.selectedExpenseIds; r.value = r.value.includes(id) ? r.value.filter(x => x !== id) : [...r.value, id]; } };
    mkRows('expense', ids);
    return { api: useCardDrag(ctx), ctx, pushed, undo, toasts };
};
const P = (o) => ({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 20, clientY: 20, target: { closest: () => null }, currentTarget: rows[0], ...o });
const reset = () => { Object.keys(listeners).forEach(k => delete listeners[k]); body = mkEl(); document.body = body; rafQ = []; };
const order = (ctx) => ctx.expenses.value.map(x => x.id).join('');

test('觸控：長按 450ms 選取；沒移動就放開＝只選取，不排序、不存檔', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, pushed } = setup();
        api.rowDown('expense', 1, P({})); mock.timers.tick(449); assert.deepEqual(ctx.selectedExpenseIds.value, []);
        mock.timers.tick(1); assert.deepEqual(ctx.selectedExpenseIds.value, [1]);
        fire('pointerup', { pointerId: 1 }); assert.equal(order(ctx), '12345'); assert.equal(pushed.length, 0);
        assert.equal((listeners.pointermove || []).length, 0);       // 收尾後監聽器都拆掉了
    } finally { mock.timers.reset(); }
});
test('觸控：長按前手指移動超過 10px＝在捲動，不選取', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx } = setup();
        api.rowDown('expense', 1, P({})); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 26 }); mock.timers.tick(449); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 40 }); mock.timers.tick(100);
        assert.deepEqual(ctx.selectedExpenseIds.value, []);
    } finally { mock.timers.reset(); }
});
test('觸控：長按「已選取」的卡片不會取消選取', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx } = setup([1, 2, 3], [2]);
        api.rowDown('expense', 2, P({ currentTarget: rows[1] })); mock.timers.tick(450);
        assert.deepEqual(ctx.selectedExpenseIds.value, [2]); fire('pointerup', { pointerId: 1 });
    } finally { mock.timers.reset(); }
});
test('觸控：長按選取後不放手直接移動 → 開始拖；放開時把它搬到目標位置並存檔', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, pushed } = setup();
        api.rowDown('expense', 1, P({ clientY: 20 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 24 });          // 還沒超過 5px
        assert.equal(api.isDragSrc('expense', 1), false);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 130 });         // 超過 → 開始拖；y=130 落在第 4 列（120～160）的上半 → 插到 4 之前
        assert.equal(api.isDragSrc('expense', 1), true); assert.equal(body.classList.contains('fd-dragging'), true);
        flush(); fire('pointerup', { pointerId: 1 });
        assert.equal(order(ctx), '23145'); assert.equal(pushed.length, 1);
        assert.equal(api.isDragSrc('expense', 1), false); assert.equal(body.classList.contains('fd-dragging'), false);
        assert.deepEqual(ctx.selectedExpenseIds.value, [1]);                         // 放下後保留勾選
    } finally { mock.timers.reset(); }
});
test('已勾選多筆：整疊一起搬，順序維持；浮動卡片堆有數量徽章', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx } = setup([1, 2, 3, 4, 5], [1, 4]);
        api.rowDown('expense', 4, P({ currentTarget: rows[3], clientY: 140 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 150 }); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 5 });   // 拖到最上面
        flush();
        const ghost = body.children.find(c => c.className.includes('fd-ghost'));
        assert.ok(ghost); assert.equal(ghost.children.some(c => c.className.includes('fd-ghost-badge') && c.textContent === '2'), true);
        assert.equal(api.isDragSrc('expense', 1), true); assert.equal(api.isDragSrc('expense', 4), true); assert.equal(api.isDragSrc('expense', 2), false);
        fire('pointerup', { pointerId: 1 }); assert.equal(order(ctx), '14235');
        assert.equal(ghost.removed, true);                                          // 浮層清乾淨
    } finally { mock.timers.reset(); }
});
test('放回原位（沒有變動）：不存檔', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, pushed } = setup();
        api.rowDown('expense', 3, P({ currentTarget: rows[2], clientY: 100 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 110 }); flush(); fire('pointerup', { pointerId: 1 });
        assert.equal(order(ctx), '12345'); assert.equal(pushed.length, 0);
    } finally { mock.timers.reset(); }
});
test('Esc 取消：不搬動、浮層收掉；之後放開也不會補搬', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, pushed } = setup();
        api.rowDown('expense', 1, P({})); mock.timers.tick(450); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 190 }); flush();
        let stopped = false; fire('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
        assert.equal(stopped, true); assert.equal(api.isDragSrc('expense', 1), false); assert.equal(body.classList.contains('fd-dragging'), false);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 10 }); flush(); fire('pointerup', { pointerId: 1 });
        assert.equal(order(ctx), '12345'); assert.equal(pushed.length, 0);
    } finally { mock.timers.reset(); }
});
test('pointercancel（瀏覽器接手捲動）：取消拖曳', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx } = setup();
        api.rowDown('expense', 1, P({})); mock.timers.tick(450); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 190 }); flush();
        fire('pointercancel', { pointerId: 1 }); assert.equal(api.isDragSrc('expense', 1), false); assert.equal(order(ctx), '12345');
    } finally { mock.timers.reset(); }
});
test('滑鼠：移動超過約 5px 才開始拖（不用長按）；單純點擊不會進入拖曳', () => {
    reset();
    const { api, ctx, pushed } = setup();
    api.rowDown('expense', 2, P({ pointerType: 'mouse', currentTarget: rows[1], clientY: 60 }));
    fire('pointermove', { pointerId: 1, clientX: 22, clientY: 63 }); assert.equal(api.isDragSrc('expense', 2), false);   // 約 3.6px
    fire('pointerup', { pointerId: 1 }); assert.equal(pushed.length, 0); assert.deepEqual(ctx.selectedExpenseIds.value, []);   // 滑鼠點擊不會被當成選取
    api.rowDown('expense', 2, P({ pointerType: 'mouse', currentTarget: rows[1], clientY: 60 }));
    fire('pointermove', { pointerId: 1, clientX: 20, clientY: 150 }); assert.equal(api.isDragSrc('expense', 2), true);
    flush(); fire('pointerup', { pointerId: 1 }); assert.equal(order(ctx), '13425'); assert.equal(pushed.length, 1);   // y=150 在第 4 列中心（140）之下 → 插到 4 之後
    assert.deepEqual(ctx.selectedExpenseIds.value, []);                              // 拖沒勾選的那一筆，不會順便勾選它
});
test('點在列裡的按鈕（圓圈、刪除）上不啟動手勢；右鍵不啟動', () => {
    reset();
    const { api } = setup();
    api.rowDown('expense', 1, P({ pointerType: 'mouse', target: { closest: () => ({}) } })); assert.equal((listeners.pointermove || []).length, 0);
    api.rowDown('expense', 1, P({ pointerType: 'mouse', button: 2 })); assert.equal((listeners.pointermove || []).length, 0);
});
test('拖曳放到最後一列之後 → 搬到最後', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx } = setup();
        api.rowDown('expense', 1, P({})); mock.timers.tick(450); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 500 }); flush(); fire('pointerup', { pointerId: 1 });
        assert.equal(order(ctx), '23451');
    } finally { mock.timers.reset(); }
});

/* ---------- V23：依日期排序後的拖曳規則（放開位置所在的那一天決定日期） ---------- */
const dates = (ctx) => ctx.expenses.value.map(x => x.date.slice(5)).join(',');
const D5 = ['2026-11-30', '2026-11-30', '2026-11-15', '2026-11-15', '2026-11-14'];   // 每列 40px：第 0、1 列＝11/30，第 2、3 列＝11/15，第 4 列＝11/14
test('V23：單筆拖進另一天 → 改成那一天的日期，放在你放開的位置，並可復原', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, pushed, undo, toasts } = setup([1, 2, 3, 4, 5], [], D5);
        api.rowDown('expense', 4, P({ currentTarget: rows[3], clientY: 140 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 150 }); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 30 }); flush();   // y=30：在第 0 列（11/30）下半 → 插到它之後
        fire('pointerup', { pointerId: 1 });
        assert.equal(order(ctx), '14235'); assert.equal(dates(ctx), '11-30,11-30,11-30,11-15,11-14');
        assert.equal(pushed.length, 1); assert.equal(undo.length, 1); assert.ok(toasts[0].includes('1 筆') && toasts[0].includes('11/30'));
    } finally { mock.timers.reset(); }
});
test('V23：兩個不同日期的紀錄一起拖 → 可以放到任何一天（不限那兩天），全部改成那一天', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, toasts } = setup([1, 2, 3, 4, 5], [1, 3], D5);
        api.rowDown('expense', 3, P({ currentTarget: rows[2], clientY: 100 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 110 }); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 170 }); flush();   // y=170：第 4 列（11/14）上半 → 放在 11/14 最上面
        fire('pointerup', { pointerId: 1 });
        assert.equal(order(ctx), '13524'); assert.equal(dates(ctx), '11-14,11-14,11-14,11-30,11-15');
        assert.ok(toasts[0].includes('2 筆') && toasts[0].includes('11/14'));
    } finally { mock.timers.reset(); }
});
test('V23：同一天內調整順序（沒改日期）不需要復原；拖到清單最下面＝最後一天的最後面', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, undo } = setup([1, 2, 3, 4, 5], [], D5);
        api.rowDown('expense', 3, P({ currentTarget: rows[2], clientY: 100 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 110 }); fire('pointermove', { pointerId: 1, clientX: 20, clientY: 150 }); flush(); fire('pointerup', { pointerId: 1 });   // y=150：第 3 列（11/15）下半 → 放在它之後
        assert.equal(order(ctx), '12435'); assert.equal(dates(ctx), '11-30,11-30,11-15,11-15,11-14'); assert.equal(undo.length, 0);
    } finally { mock.timers.reset(); }
});
test('V23：股票連動且與目標日期不同天的收支不跟著搬（維持原日期）；徽章數字會隨目標日期更新', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, toasts } = setup([1, 2, 3], [1, 3], ['2026-11-30', '2026-11-15', '2026-11-15'], { stockIds: [99] });
        api.rowDown('expense', 3, P({ currentTarget: rows[2], clientY: 100 })); mock.timers.tick(450);
        const badge = () => body.children.find(c => c.className.includes('fd-ghost')).children.find(c => c.className.includes('fd-ghost-badge'));
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 130 }); flush();      // 游標在 11/15 → 連動收支（11/30）被排除，只剩 1 筆
        assert.equal(badge().textContent, '1'); assert.equal(badge().style.display, 'none');
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 10 }); flush();       // 游標移到 11/30 → 兩筆都會搬
        assert.equal(badge().textContent, '2'); assert.equal(badge().style.display, '');
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 500 }); flush(); fire('pointerup', { pointerId: 1 });
        assert.equal(dates(ctx), '11-30,11-15,11-15'); assert.equal(order(ctx), '123'); assert.equal(toasts.length, 0);
    } finally { mock.timers.reset(); }
});
test('V22：股票交易被整疊改日期 → 連動的收支也改成同一天', () => {
    mock.timers.enable({ apis: ['setTimeout'] }); reset();
    try {
        const { api, ctx, pushed, undo } = setup([1, 2, 3], [], ['2026-11-30', '2026-11-15', '2026-11-15']);
        const trades = [{ id: 11, date: '2026-11-30' }, { id: 12, date: '2026-11-15' }, { id: 13, date: '2026-11-15' }];
        ctx.stockTrades.value = trades; ctx.filteredStockTrades.value = trades; ctx.selectedStockIds.value = [11, 13];
        ctx.expenses.value = [{ id: 101, date: '2026-11-30', stockId: 11 }, { id: 102, date: '2026-11-15' }, { id: 103, date: '2026-11-15', stockId: 13 }];
        mkRows('stock', [11, 12, 13]);
        api.rowDown('stock', 13, P({ currentTarget: rows[2], clientY: 100 })); mock.timers.tick(450);
        fire('pointermove', { pointerId: 1, clientX: 20, clientY: 500 }); flush(); fire('pointerup', { pointerId: 1 });
        assert.deepEqual(ctx.stockTrades.value.map(t => t.date.slice(5)), ['11-15', '11-15', '11-15']);
        assert.equal(ctx.expenses.value.find(e => e.id === 101).date, '2026-11-15');       // 連動收支跟著改
        assert.equal(ctx.expenses.value.find(e => e.id === 102).date, '2026-11-15');
        assert.equal(undo.length, 1); assert.equal(pushed.length, 1);
    } finally { mock.timers.reset(); }
});
