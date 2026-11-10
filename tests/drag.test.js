import test from 'node:test';
import assert from 'node:assert/strict';
import { moveGroup } from '../js/logic/reorder.js';
import { slotFromY, edgeScrollDelta, movedBeyond, groupIdsFor, isNoopSlot } from '../js/logic/drag.js';

const mk = (s) => s.split('').map(id => ({ id }));
const ids = (l) => l.map(x => x.id).join('');

test('moveGroup：單筆搬到某筆之前／最後', () => {
    const f = mk('abcd');
    assert.equal(ids(moveGroup(f, f, ['a'], 'c')), 'bacd');
    assert.equal(ids(moveGroup(f, f, ['d'], 'a')), 'dabc');
    assert.equal(ids(moveGroup(f, f, ['a'], null)), 'bcda');
});
test('moveGroup：多筆整疊搬，保持彼此原本的順序', () => {
    const f = mk('abcdef');
    assert.equal(ids(moveGroup(f, f, ['b', 'e'], 'a')), 'beacdf');
    assert.equal(ids(moveGroup(f, f, ['e', 'b'], 'f')), 'acdbef');      // groupIds 順序不影響結果
    assert.equal(ids(moveGroup(f, f, ['a', 'b'], null)), 'cdefab');
});
test('moveGroup：放在自己人之前（錨點在那疊裡）→ 往後找第一個不在那疊的', () => {
    const f = mk('abcd');
    assert.equal(moveGroup(f, f, ['a', 'b'], 'b'), f);                 // 放回原處＝沒變，回傳同一個陣列
    assert.equal(ids(moveGroup(f, f, ['b'], 'b')), 'abcd');
    assert.equal(ids(moveGroup(mk('abcd'), mk('abcd'), ['a', 'c'], 'c')), 'bacd');   // a、c 併成一疊放到 d 之前
});
test('moveGroup：篩選後只看到一部分，看不到的紀錄位置不動、不增不減', () => {
    const f = mk('abcdefg'), view = [f[1], f[3], f[5]];                 // 畫面只看到 b、d、f
    const r = moveGroup(f, view, ['f'], 'b');
    assert.equal(ids(r), 'afbcdeg'); assert.equal(r.length, f.length);
    assert.equal(ids(moveGroup(f, view, ['b'], null)), 'acdefbg');     // 放到畫面最後＝接在 f 後面
});
test('moveGroup：整份清單都在那疊裡、或 id 不存在 → 不動', () => {
    const f = mk('abc');
    assert.equal(moveGroup(f, f, ['a', 'b', 'c'], null), f);
    assert.equal(moveGroup(f, f, ['x'], 'a'), f);
    assert.equal(moveGroup(f, f, [], 'a'), f);
    assert.equal(moveGroup(f, f, ['a'], 'zzz'), f);
});
test('moveGroup：id 數字與字串混用也能比對', () => {
    const f = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.equal(moveGroup(f, f, ['3'], 1).map(x => x.id).join(''), '312');
});

test('slotFromY：依列的中心判斷插入位置', () => {
    const mids = [10, 30, 50];
    assert.equal(slotFromY(mids, 0), 0); assert.equal(slotFromY(mids, 10), 1); assert.equal(slotFromY(mids, 29), 1); assert.equal(slotFromY(mids, 49), 2); assert.equal(slotFromY(mids, 500), 3);
    assert.equal(slotFromY([], 5), 0);
});
test('edgeScrollDelta：中間不捲、靠近上緣往上、靠近下緣往下，越近越快', () => {
    assert.equal(edgeScrollDelta(300, 0, 600), 0);
    assert.ok(edgeScrollDelta(10, 0, 600) < 0); assert.ok(edgeScrollDelta(590, 0, 600) > 0);
    assert.ok(Math.abs(edgeScrollDelta(2, 0, 600)) > Math.abs(edgeScrollDelta(50, 0, 600)));
    assert.equal(edgeScrollDelta(-50, 0, 600), -18); assert.equal(edgeScrollDelta(900, 0, 600), 18);   // 超出邊界＝最快，不會爆量
    assert.equal(edgeScrollDelta(5, 100, 100), 0);                                                      // 可捲範圍無效
});
test('movedBeyond：以直線距離判斷（約 5px 才算拖）', () => {
    assert.equal(movedBeyond(3, 4, 5), false); assert.equal(movedBeyond(3, 4.1, 5), true); assert.equal(movedBeyond(0, 0, 5), false);
});
test('groupIdsFor：拖已勾選的＝全部已勾選的（依畫面順序）；拖沒勾選的＝只有它', () => {
    assert.deepEqual(groupIdsFor('b', ['d', 'b'], ['a', 'b', 'c', 'd']), ['b', 'd']);
    assert.deepEqual(groupIdsFor('a', ['d', 'b'], ['a', 'b', 'c', 'd']), ['a']);
    assert.deepEqual(groupIdsFor(2, [2, 9], [1, 2, 3]), ['2']);        // 勾選但不在目前篩選結果的不算
});
test('isNoopSlot：連續的一疊放在自己範圍內＝沒變動；不連續＝一定有變動', () => {
    const v = ['a', 'b', 'c', 'd', 'e'];
    assert.equal(isNoopSlot(v, ['b', 'c'], 1), true); assert.equal(isNoopSlot(v, ['b', 'c'], 2), true); assert.equal(isNoopSlot(v, ['b', 'c'], 3), true);
    assert.equal(isNoopSlot(v, ['b', 'c'], 0), false); assert.equal(isNoopSlot(v, ['b', 'c'], 4), false);
    assert.equal(isNoopSlot(v, ['b', 'd'], 2), false);
    assert.equal(isNoopSlot(v, ['e'], 5), true);
});
// 一致性：isNoopSlot 說沒變動，moveGroup 就必須回傳原陣列；反之必須有變動
test('isNoopSlot 與 moveGroup 結果一致（窮舉）', () => {
    const full = mk('abcde'), vids = full.map(x => x.id);
    for (const g of [['a'], ['c'], ['e'], ['a', 'b'], ['b', 'c'], ['b', 'd'], ['a', 'e'], ['c', 'd', 'e']]) {
        for (let slot = 0; slot <= full.length; slot++) {
            const before = slot < full.length ? full[slot].id : null;
            const same = moveGroup(full, full, g, before) === full;
            assert.equal(isNoopSlot(vids, g, slot), same, `group=${g} slot=${slot}`);
        }
    }
});
