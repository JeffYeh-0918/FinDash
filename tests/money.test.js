import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fmtMoney, fmtCompact, COMPACT_FROM } from '../js/logic/money.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('V26.2 金額不加 NT$；100 萬以下維持完整數字', () => {
    assert.equal(fmtMoney(202920), '202,920');
    assert.equal(fmtMoney(-28020.4), '-28,020');
    assert.equal(fmtMoney(null), '0');
    assert.equal(COMPACT_FROM, 1000000);
    assert.equal(fmtCompact(999999), '999,999');
    assert.equal(fmtCompact(-12345), '-12,345');
});
test('V26.2 100 萬以上用萬、1 億以上用億（保留正負號）', () => {
    assert.equal(fmtCompact(1000000), '100萬');
    assert.equal(fmtCompact(1234567), '123.5萬');
    assert.equal(fmtCompact(-1500000), '-150萬');
    assert.equal(fmtCompact(99999999), '1億');       // 進位後滿 1 億
    assert.equal(fmtCompact(123456789), '1.23億');
    assert.equal(fmtCompact(-250000000), '-2.5億');
    assert.equal(fmtCompact(150000, 100000), '15萬');   // 累積已實現損益卡：前面多了箭頭與正負號，門檻降到 10 萬
    assert.equal(fmtCompact(99999, 100000), '99,999');
});
test('V26.2 全站已沒有 NT$（前綴、欄位標籤、圖表提示）', () => {
    for (const p of ['../index.html', '../js/features/charts.js', '../js/features/motion.js', '../js/features/state.js', '../js/features/ledger-view.js']) {
        assert.ok(!read(p).includes('NT$'), p + ' 還有 NT$');
    }
});
test('V26.2 頂部四張卡的數字都標 compact，窄螢幕才縮寫', () => {
    assert.ok((html.match(/<fd-num :value="[^"]+" compact[^>]*><\/fd-num>/g) || []).length >= 7);
    assert.match(css, /@media \(max-width: 479px\) \{ \.fd-amt-full \{ display: none; \} \.fd-amt-short \{ display: inline; \} \}/);
    assert.match(read('../js/features/motion.js'), /compact: \{ type: Boolean/);
});
test('V26.2 已付金額說明是 ⓘ 按鈕＋氣泡（用 activeDropdown，Esc 先關氣泡）', () => {
    assert.match(html, /class="fd-info-btn"[^>]*aria-label="已付金額說明"/);
    assert.match(html, /v-if="activeDropdown === 'paidHint'" class="fd-info-pop"/);
    assert.ok(!html.includes('<p class="text-xs text-slate-400 mt-1">預付類付款方式使用時，記在這裡</p>'));
    assert.match(read('../js/features/modals.js'), /'paidHint'\) \{ ev\.preventDefault\(\); closeAllDropdowns\(\)/);
});
test('V26.2 焦點外框統一（input／textarea／select 同一個 --focus 色）；彈窗只在開啟時自動聚焦一次', () => {
    assert.match(css, /select:focus-visible, input:focus-visible, textarea:focus-visible[^{]*\{ outline: 2px solid var\(--focus\)/);
    assert.match(css, /--focus: #34d399/);
    const m = read('../js/features/modals.js');
    assert.match(m, /if \(!top\.hasAttribute\('data-fd-focused'\)\)/);
    assert.match(m, /top\.setAttribute\('data-fd-focused'/);
});
