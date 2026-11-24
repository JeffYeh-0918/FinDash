import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_TABS, isNavWide, nextNavPref, navTabIndex } from '../js/logic/nav.js';

test('側邊欄預設：1280px 以上展開，其餘窄欄', () => {
    assert.equal(isNavWide('', 1440), true); assert.equal(isNavWide('', 1280), true);
    assert.equal(isNavWide('', 1279), false); assert.equal(isNavWide('', 800), false);
});
test('使用者選了展開：1024px 以上才展開（再窄就沒空間）；選了收合：一律窄欄', () => {
    assert.equal(isNavWide('wide', 1100), true); assert.equal(isNavWide('wide', 1023), false);
    assert.equal(isNavWide('mini', 1920), false);
});
test('收合／展開按鈕：目前展開 → mini；目前窄欄 → wide', () => {
    assert.equal(nextNavPref(true), 'mini'); assert.equal(nextNavPref(false), 'wide');
});
test('分頁順序與索引：選取指示條依索引移動；找不到就回第一個', () => {
    assert.deepEqual(NAV_TABS.map(t => t.key), ['expenses', 'investments', 'monthly', 'cards']);
    assert.equal(navTabIndex('cards'), 3); assert.equal(navTabIndex('nope'), 0);
});
