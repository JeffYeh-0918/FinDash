import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { plClass, plArrow, plSign } from '../js/logic/pl.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');

test('V26.1 損益：正＝紅漲▲＋號、負＝綠跌▼、零或四捨五入為零＝持平（無箭頭無正負號）', () => {
    assert.deepEqual([plClass(1234), plArrow(1234), plSign(1234)], ['fd-gain', '▲', '+']);
    assert.deepEqual([plClass(-50), plArrow(-50), plSign(-50)], ['fd-loss', '▼', '']);
    assert.deepEqual([plClass(0), plArrow(0), plSign(0)], ['fd-flat', '', '']);
    assert.equal(plClass(0.4), 'fd-flat');
    assert.equal(plClass(-0.4), 'fd-flat');
    assert.equal(plClass(0.6), 'fd-gain');
    assert.equal(plClass(NaN), 'fd-flat');
    assert.equal(plClass(undefined), 'fd-flat');
});
test('V26.1 損益色變數：紅漲綠跌，且範本的損益不再用 emerald／rose', () => {
    assert.match(css, /--gain:\s*#ff6b7a/i);
    assert.match(css, /--loss:\s*#34d399/i);
    assert.ok(!/(PL|gain|total)[A-Za-z]* >= 0 \? 'text-emerald/.test(html), '還有損益用綠色代表賺');
    assert.ok((html.match(/plClass\(/g) || []).length >= 7);
});
test('V26.1 白字按鈕底色對比 ≥4.5:1：沒有 bg-emerald-600／#059669 當白字底', () => {
    assert.ok(!html.includes('bg-emerald-600'));
    assert.ok(!html.includes('#059669') && !css.includes('#059669'));
    assert.match(css, /\.fd-btn-primary\s*\{\s*background-color:\s*(#047857|rgb\(var\(--c-emerald-700\)\))/);   // V27：色碼已換成 token（深色等值）
});
test('V26.1 手機次要資訊字級不低於 12px', () => {
    const small = [];
    css.split('\n').forEach((l, i) => { for (const m of l.matchAll(/font-size:\s*([0-9.]+)(px|rem)/g)) { const v = parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1); if (v < 12) small.push(`${i + 1}:${m[0]}`); } });
    assert.deepEqual(small, []);
});
test('V26.1 名稱統一、表單 inputmode、純圖示按鈕 aria-label', () => {
    assert.ok(!html.includes('付款管道'));
    assert.ok(!/ETF ?[&＆] ?股票/.test(html));
    assert.ok((html.match(/inputmode="numeric"/g) || []).length >= 6);
    assert.equal((html.match(/inputmode="decimal"/g) || []).length, 1);
    for (const m of html.matchAll(/<button\b[^>]*>/g)) {
        const end = html.indexOf('</button>', m.index), inner = html.slice(m.index + m[0].length, end).replace(/<[^>]+>/g, '').trim();
        if (inner.length <= 1) assert.match(m[0], /aria-label=/, '純圖示／符號按鈕缺 aria-label：' + m[0].slice(0, 80));
    }
});
test('V27.3 果凍切換（滑塊 left／right 先後移動）、圖表字型預設', () => {
    assert.match(css, /\.fd-seg2\[data-dir="r"\]::before \{ transition: right \.2s var\(--jelly-lead\), left \.34s \.06s var\(--jelly\)/);
    const charts = fs.readFileSync(new URL('../js/features/charts.js', import.meta.url), 'utf8');
    assert.match(charts, /Chart\.defaults\.font\.family/);
    assert.match(charts, /Chart\.defaults\.color/);
    assert.match(css, /"PingFang TC", "Noto Sans TC", "Microsoft JhengHei"/);
});
