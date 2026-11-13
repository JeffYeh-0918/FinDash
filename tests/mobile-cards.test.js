import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Vue = { ref: v => ({ value: v }), computed: fn => ({ get value() { return fn(); } }), watch() {}, onMounted() {} };
globalThis.Vue.watch = () => {};
const { useMobileCards } = await import('../js/features/mobile-cards.js');

const E = (o) => ({ id: o.id, type: '支出', date: '2026-11-07', category: '固定支出', item: '飲食費', amount: 100, ...o });
const setup = ({ expenses = [], stocks = [] } = {}) => {
    const opened = [];
    const ctx = {
        displayedExpenses: { value: expenses }, filteredExpenses: { value: expenses }, filteredStockTrades: { value: stocks }, selectedExpenseIds: { value: [] }, selectedStockIds: { value: [] },
        openExpenseModal: (x) => opened.push(['expense', x.id]), openStockModal: (x) => opened.push(['stock', x.id]), catColor: () => '#6366f1'
    };
    return { api: useMobileCards(ctx), ctx, opened };
};

test('依日期分組：只合併相鄰同一天，保留手動排序；並加總支出與收入', () => {
    const { api } = setup({ expenses: [E({ id: 1, date: '2026-11-07', amount: 100 }), E({ id: 2, date: '2026-11-07', amount: 50 }), E({ id: 3, date: '2026-11-06', type: '收入', amount: 300 }), E({ id: 4, date: '2026-11-07', amount: 10 })] });
    const g = api.expenseDayGroups.value;
    assert.deepEqual(g.map(x => x.items.length), [2, 1, 1]);        // 11/07 被 11/06 隔開，不能硬併成一組
    assert.equal(g[0].exp, 150); assert.equal(g[1].inc, 300); assert.match(g[0].label, /^11\/07 週[日一二三四五六]$/);
    assert.equal(new Set(g.map(x => x.id)).size, 3);                // 每組的 key 不重複
});
test('日期缺漏不會當掉', () => { const { api } = setup({ expenses: [E({ id: 1, date: '' })] }); assert.equal(api.expenseDayGroups.value[0].label, '未填日期'); });
test('月收支比例條：消費、投資、剩餘依收入比例；超支時縮放並標記', () => {
    const { api } = setup();
    const b = api.monthBar({ income: 1000, consume: 500, invest: 100 });
    assert.deepEqual([b.consume, b.invest, b.rest, b.over, b.noIncome], [50, 10, 40, false, false]);
    assert.deepEqual(b.segs.map(s => [s.label, s.pct, s.amt]), [['消費', 50, 500], ['淨投入', 10, 100], ['剩餘', 40, 400]]);   // 每一段都有顏色、比例與金額，可逐段標示
    const o = api.monthBar({ income: 1000, consume: 1500, invest: 500 }); assert.equal(o.over, true); assert.equal(o.rest, 0); assert.equal(o.consume + o.invest, 100);
    assert.deepEqual(o.segs.map(s => s.label), ['消費', '淨投入']);                        // 超支：沒有「剩餘」這一段
    assert.equal(api.monthBar({ income: 0, consume: 0, invest: 0 }), null);              // 完全沒有收支才沒有長條
    assert.equal(api.monthBar({ income: 1000, consume: 100, invest: -300 }).invest, 0);   // 投資淨額為負（賣出多於買進）不畫負的長度
});
test('月收支比例條：投資淨回收（淨額為負）的月份只有消費與剩餘，與卡片上的收入、消費對得上', () => {
    const { api } = setup();
    const b = api.monthBar({ income: 40315, consume: 23645, invest: -91634 });          // 例：2026/10
    assert.deepEqual(b.segs.map(s => [s.label, s.amt]), [['消費', 23645], ['剩餘', 16670]]);
    assert.equal(Math.round((b.consume + b.rest) * 10) / 10, 100);
});
test('月收支比例條：沒有收入的月份改以支出當 100%，不再整條消失', () => {
    const { api } = setup();
    const b = api.monthBar({ income: 0, consume: 28559, invest: 66395 });                // 例：2026/11
    assert.equal(b.noIncome, true); assert.equal(b.over, false); assert.equal(b.rest, 0);
    assert.deepEqual(b.segs.map(s => [s.label, s.amt]), [['消費', 28559], ['淨投入', 66395]]);
    assert.equal(Math.round((b.consume + b.invest) * 10) / 10, 100);
    assert.equal(api.monthBar({ income: 0, consume: 5, invest: 0 }).segs.length, 1);
});
test('月收支標示：左＝收入（與淨賣出），右＝消費（與淨投入）與剩餘；顏色與長條一致', () => {
    const { api } = setup();
    const lab = (a) => a.map(s => [s.label, s.amt]);
    const f1 = api.monthFlow({ income: 40315, consume: 23645, invest: -91634 });           // 例：2026/10（淨賣出）
    assert.deepEqual(lab(f1.left), [['收入', 40315], ['淨賣出', 91634]]);
    assert.deepEqual(lab(f1.right), [['消費', 23645], ['剩餘', 16670]]);
    const f2 = api.monthFlow({ income: 37668, consume: 29063, invest: 1000 });             // 淨投入
    assert.deepEqual(lab(f2.left), [['收入', 37668]]); assert.deepEqual(lab(f2.right), [['消費', 29063], ['淨投入', 1000], ['剩餘', 7605]]);
    const f3 = api.monthFlow({ income: 0, consume: 28559, invest: 66395 });                // 例：2026/11（沒有收入）
    assert.equal(f3.noIncome, true); assert.deepEqual(lab(f3.left), [['收入', 0]]); assert.deepEqual(lab(f3.right), [['消費', 28559], ['淨投入', 66395]]);
    assert.equal(api.monthFlow({ income: 1000, consume: 1500, invest: 0 }).right.some(s => s.label === '剩餘'), false);   // 超支：沒有剩餘
    assert.deepEqual(lab(api.monthFlow({ income: 0, consume: 0, invest: 0 }).right), [['消費', 0]]);                       // 完全沒資料也不會爆
    assert.equal(f1.left[0].color, null); assert.equal(f1.right[0].color, '#818cf8'); assert.equal(f1.left[1].color, '#fbbf24'); assert.equal(f1.right[1].color, '#34d399');
});
test('類別圖示（lucide 名稱）：先看項目、再看類別，找不到用預設', () => {
    const { api } = setup();
    assert.equal(api.expenseIconName({ item: '飲食費', category: '固定支出', type: '支出' }), 'utensils');
    assert.equal(api.expenseIconName({ item: '其他', category: '保險', type: '支出' }), 'shield');
    assert.equal(api.expenseIconName({ item: '？', category: '？', type: '收入' }), 'wallet'); assert.equal(api.expenseIconName({ item: '？', category: '？', type: '支出' }), 'tag');
    assert.equal(api.expenseIconName({ item: 'ETF賣出', category: '投資儲蓄', type: '收入' }), 'trending-down');
    assert.equal(api.expenseIconName({ item: 'ETF投資', category: '投資儲蓄', type: '支出' }), 'trending-up');
});
test('圓圈顏色取自該類別的設定顏色', () => assert.deepEqual(setup().api.catCircleStyle('固定支出'), { background: '#6366f12b', borderColor: '#6366f166', color: '#6366f1' }));

test('點一下：沒有選取時開啟編輯；選取模式中改為加選／取消', () => {
    const { api, ctx, opened } = setup();
    api.fdmTap('expense', E({ id: 7 })); api.fdmTap('stock', { id: 9 }); assert.deepEqual(opened, [['expense', 7], ['stock', 9]]);
    ctx.selectedExpenseIds.value = [1];
    api.fdmTap('expense', E({ id: 2 })); assert.deepEqual(ctx.selectedExpenseIds.value, [1, 2]); api.fdmTap('expense', E({ id: 1 })); assert.deepEqual(ctx.selectedExpenseIds.value, [2]);
    assert.equal(opened.length, 2);                                // 選取模式中不會開編輯視窗
});
test('完成：離開選取模式、清空勾選並收起批次選單；股票與收支互不影響', () => {
    const { api, ctx } = setup(); ctx.selectedExpenseIds.value = [1, 2]; ctx.selectedStockIds.value = [5]; api.batchMenuOpen.value = true;
    api.fdmDone('expense'); assert.deepEqual(ctx.selectedExpenseIds.value, []); assert.deepEqual(ctx.selectedStockIds.value, [5]); assert.equal(api.batchMenuOpen.value, false);
});
test('按「選取」進入選取模式（還沒勾選任何一筆）：點卡片是勾選、不是開編輯；完成後恢復', () => {
    const { api, ctx, opened } = setup(); assert.equal(api.fdmSelecting('expense'), false);
    api.fdmEnter('expense'); assert.equal(api.fdmSelecting('expense'), true); assert.equal(api.fdmSelecting('stock'), false);   // 兩個清單各自獨立
    api.fdmTap('expense', E({ id: 3 })); assert.deepEqual(ctx.selectedExpenseIds.value, [3]); assert.deepEqual(opened, []);
    api.fdmDone('expense'); assert.equal(api.fdmSelecting('expense'), false); api.fdmTap('expense', E({ id: 3 })); assert.deepEqual(opened, [['expense', 3]]);
});
test('全選＝目前篩選結果的全部紀錄；全部已選時再按就是取消全選', () => {
    const rows = [E({ id: 1 }), E({ id: 2 }), E({ id: 3 })];
    const { api, ctx } = setup({ expenses: rows });
    ctx.displayedExpenses.value = rows.slice(0, 1);          // 畫面只載入 1 筆，全選仍要涵蓋全部 3 筆
    assert.equal(api.fdmAllSelected('expense'), false);
    api.fdmToggleAll('expense'); assert.deepEqual(ctx.selectedExpenseIds.value, [1, 2, 3]); assert.equal(api.fdmAllSelected('expense'), true);
    api.fdmToggleAll('expense'); assert.deepEqual(ctx.selectedExpenseIds.value, []);
    ctx.selectedExpenseIds.value = [1]; assert.equal(api.fdmAllSelected('expense'), false);   // 只選一部分不算全選
});
test('沒有任何紀錄時，全選不會誤判為已全選', () => { const { api } = setup(); assert.equal(api.fdmAllSelected('expense'), false); assert.equal(api.fdmAllSelected('stock'), false); });
