import test from 'node:test';
import assert from 'node:assert/strict';
import { dropHiddenSelection as f } from '../js/logic/selection.js';
const ref = (v) => ({ value: v });
test('不在清單內的勾選被釋放（id 型別不同也能比對）', () => { const s = ref([1, '2', 3]); f(s, [{ id: 1 }, { id: 2 }]); assert.deepEqual(s.value, [1, '2']); });
test('沒有變動就不重設陣列', () => { const s = ref([1]); const b = s.value; f(s, [{ id: 1 }, { id: 9 }]); assert.equal(s.value, b); });
test('空勾選不處理', () => { const s = ref([]); f(s, []); assert.deepEqual(s.value, []); });
