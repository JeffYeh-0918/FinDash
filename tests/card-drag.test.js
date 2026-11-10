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
const setup = (ids = [1, 2, 3, 4, 5], selected = []) => {
    const exp = ids.map(id => ({ id })), pushed = [];
    const ctx = { selectedExpenseIds: { value: selected }, selectedStockIds: { value: [] }, expenses: { value: exp }, stockTrades: { value: [] }, filteredExpenses: { value: exp }, filteredStockTrades: { value: [] },
        pushToCloud: () => pushed.push(1), renderCharts: () => {}, fdmToggleSel: (k, id) => { const r = k === 'stock' ? ctx.selectedStockIds : ctx.selectedExpenseIds; r.value = r.value.includes(id) ? r.value.filter(x => x !== id) : [...r.value, id]; } };
    mkRows('expense', ids);
    return { api: useCardDrag(ctx), ctx, pushed };
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
