import test from 'node:test';
import assert from 'node:assert/strict';
import { withDefaultSettings } from '../js/logic/ledger.js';
import { renameInSettings, removeFromSettings } from '../js/logic/settings-ops.js';
test('類別改名：對照表、顏色、屬性清單一起跟著改', () => {
  const st = withDefaultSettings({ categoryColors: { 墊付: '#ff0000' } });
  renameInSettings(st, 'category', '墊付', '代墊款');
  assert.ok('代墊款' in st.categoryItems && !('墊付' in st.categoryItems));
  assert.equal(st.categoryColors['代墊款'], '#ff0000'); assert.ok(!('墊付' in st.categoryColors));
  assert.ok(st.passThroughCategories.includes('代墊款') && !st.passThroughCategories.includes('墊付'));
});
test('刪除類別：對照表、顏色、屬性清單一起清掉', () => {
  const st = withDefaultSettings({ categoryColors: { 保險: '#06b6d4' } });
  removeFromSettings(st, 'category', '保險');
  assert.ok(!('保險' in st.categoryItems)); assert.ok(!('保險' in st.categoryColors));
});
test('項目改名：各類別的項目清單同步', () => {
  const st = withDefaultSettings(null);
  renameInSettings(st, 'item', '交通費', '通勤費');
  assert.ok(Object.values(st.categoryItems).filter(Array.isArray).some(a => a.includes('通勤費')));
  assert.ok(!Object.values(st.categoryItems).filter(Array.isArray).some(a => a.includes('交通費')));
});
