import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByDateDesc, insertAtDayEnd, putRecord, moveToDay, retargetLinked, isLinkedOtherDay } from '../js/logic/order.js';
import { clampSlotToDay } from '../js/logic/drag.js';

const r = (id, date, extra = {}) => ({ id, date, ...extra });
const ids = (l) => l.map(x => x.id).join(',');

test('sortByDateDesc：日期新→舊；同一天維持原本順序；沒填日期排最後；不改原陣列', () => {
    const src = [r('a', '2026-11-15'), r('b', '2026-11-30'), r('c', ''), r('d', '2026-11-15'), r('e', '2026-11-30'), r('f', '2026-11-14')];
    const snap = ids(src);
    assert.equal(ids(sortByDateDesc(src)), 'b,e,a,d,f,c');
    assert.equal(ids(src), snap);
});
test('使用者情境：已有 11/30，之後補登 11/15 → 排在原本 11/15 的最後一筆，不會另開一組', () => {
    const list = [r(1, '2026-11-30'), r(2, '2026-11-15'), r(3, '2026-11-15'), r(4, '2026-11-14')];
    const next = insertAtDayEnd(list, r(9, '2026-11-15'));
    assert.equal(ids(sortByDateDesc(next)), '1,2,3,9,4');
    assert.equal(ids(list), '1,2,3,4');   // 沒有改到原陣列
});
test('insertAtDayEnd：該日期還沒有紀錄 → 放最前面，顯示時自動排進正確位置；一次多筆維持順序', () => {
    const list = [r(1, '2026-11-30'), r(2, '2026-11-10')];
    assert.equal(ids(sortByDateDesc(insertAtDayEnd(list, r(9, '2026-11-20')))), '1,9,2');
    const many = insertAtDayEnd([r(1, '2026-11-15')], [r(7, '2026-11-15'), r(8, '2026-11-15'), r(9, '2026-11-01')]);
    assert.equal(ids(sortByDateDesc(many)), '1,7,8,9');
});
test('putRecord：日期沒變＝原地更新；日期改了＝搬到新日期的最後一筆；找不到就原樣回傳', () => {
    const list = [r(1, '2026-11-30'), r(2, '2026-11-15'), r(3, '2026-11-15')];
    const same = putRecord(list, 2, r(2, '2026-11-15', { amount: 5 }));
    assert.equal(ids(same), '1,2,3'); assert.equal(same[1].amount, 5);
    assert.equal(ids(sortByDateDesc(putRecord(list, 2, r(2, '2026-11-30')))), '1,2,3');   // 2 變 11/30 → 排在 1 之後
    assert.equal(ids(sortByDateDesc(putRecord(list, 1, r(1, '2026-11-15')))), '2,3,1');   // 1 變 11/15 → 排在 2、3 之後
    assert.equal(putRecord(list, 99, r(99, 'x')), list);
});
test('moveToDay：整疊改成指定日期並放到指定位置；其他天的紀錄位置不動', () => {
    const full = [r(1, '2026-11-30'), r(2, '2026-11-15'), r(3, '2026-11-15'), r(4, '2026-11-14')];
    const view = sortByDateDesc(full);
    const res = moveToDay(full, view, [1, 3], 2, '2026-11-15');   // 1、3 放到 2 之前
    assert.deepEqual(res.dateChanged, ['1']);
    assert.equal(ids(sortByDateDesc(res.list)), '1,3,2,4'.replace('1,3,2,4', '1,3,2,4'));
    assert.equal(res.list.find(x => x.id === 1).date, '2026-11-15');
    assert.equal(full[0].date, '2026-11-30');   // 原物件不被改
});
test('moveToDay：beforeId 不在這一天或為 null → 放在這天（畫面上看得到的）最後面', () => {
    const full = [r(1, '2026-11-15'), r(2, '2026-11-15'), r(3, '2026-11-14')];
    const view = sortByDateDesc(full);
    assert.equal(ids(moveToDay(full, view, [1], 3, '2026-11-15').list), '2,1,3');
    assert.equal(ids(moveToDay(full, view, [1], null, '2026-11-15').list), '2,1,3');
});
test('moveToDay：被篩選掉的同日紀錄位置不動；放到最後只接在畫面最後一筆之後', () => {
    const full = [r(1, '2026-11-15'), r(2, '2026-11-15'), r(3, '2026-11-15'), r(4, '2026-11-15')];
    const view = [full[0], full[1]];   // 3、4 被篩掉
    assert.equal(ids(moveToDay(full, view, [1], null, '2026-11-15').list), '2,1,3,4');
});
test('moveToDay：沒有變動 → 回傳同一個陣列；沒填日期 → 不處理', () => {
    const full = [r(1, '2026-11-15'), r(2, '2026-11-15')];
    const view = sortByDateDesc(full);
    const same = moveToDay(full, view, [1], 2, '2026-11-15');
    assert.equal(same.list, full); assert.deepEqual(same.dateChanged, []);
    assert.equal(moveToDay(full, view, [1], 2, '').list, full);
});
test('moveToDay：錨點在被搬的那疊裡 → 往後找第一筆不在那疊的', () => {
    const full = [r(1, '2026-11-15'), r(2, '2026-11-15'), r(3, '2026-11-15')];
    const view = sortByDateDesc(full);
    assert.equal(ids(moveToDay(full, view, [1, 2], 2, '2026-11-15').list), '1,2,3');   // 本來就在那個位置
    assert.equal(ids(moveToDay(full, view, [2], 2, '2026-11-15').list), '1,2,3');
});
test('retargetLinked：股票交易改日期 → 以 stockId 連動的收支跟著改，並排到新日期最後；沒有要改就回傳原陣列', () => {
    const exp = [r(101, '2026-11-30', { stockId: 11 }), r(102, '2026-11-15'), r(103, '2026-11-15', { stockId: 13 })];
    const out = retargetLinked(exp, ['11'], '2026-11-15');
    assert.equal(ids(sortByDateDesc(out)), '102,103,101');
    assert.equal(retargetLinked(exp, ['13'], '2026-11-15'), exp);
    assert.equal(retargetLinked(exp, [], '2026-11-15'), exp);
});
test('isLinkedOtherDay：有股票連動記號且與指定日期不同天才算', () => {
    assert.equal(isLinkedOtherDay(r(1, '2026-11-30', { stockId: 5 }), '2026-11-15'), true);
    assert.equal(isLinkedOtherDay(r(1, '2026-11-15', { stockId: 5 }), '2026-11-15'), false);
    assert.equal(isLinkedOtherDay(r(1, '2026-11-30', { stockId: '' }), '2026-11-15'), false);
    assert.equal(isLinkedOtherDay(r(1, '2026-11-30'), '2026-11-15'), false);
});
test('clampSlotToDay：插入位置夾在那一天的範圍內；找不到那一天就原樣', () => {
    const d = ['11-30', '11-30', '11-15', '11-15', '11-15', '11-14'];
    assert.equal(clampSlotToDay(d, 0, '11-15'), 2);
    assert.equal(clampSlotToDay(d, 3, '11-15'), 3);
    assert.equal(clampSlotToDay(d, 6, '11-15'), 5);
    assert.equal(clampSlotToDay(d, 4, '99-99'), 4);
});
