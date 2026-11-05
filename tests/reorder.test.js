import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderWithGroup } from '../js/logic/reorder.js';
const rows = ['a', 'b', 'c', 'd'].map(id => ({ id }));
const ids = (l) => l.map(x => x.id).join('');
test('沒勾選：只搬被拖的那一列', () => assert.equal(ids(reorderWithGroup(rows, rows, 0, 2, [])), 'bcad'));
test('被拖的列有勾選：已勾選的一起搬', () => assert.equal(ids(reorderWithGroup(rows, rows, 0, 3, ['a', 'b'])), 'cdab'));
test('放到自己人身上：不動', () => assert.equal(reorderWithGroup(rows, rows, 0, 1, ['a', 'b']), rows));
