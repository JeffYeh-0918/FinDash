import test from 'node:test';
import assert from 'node:assert/strict';
import { swipeIntent, swipeThreshold, swipeReached, swipeOffset, SWIPE_SLOP } from '../js/logic/swipe.js';

test('swipeIntent：沒動夠＝none；往左橫向＝swipe；直向、往右、斜向太大＝scroll', () => {
    assert.equal(swipeIntent(-5, 3), 'none');
    assert.equal(swipeIntent(-30, 4), 'swipe');
    assert.equal(swipeIntent(-30, 15), 'swipe');       // 水平分量大於垂直 1.5 倍
    assert.equal(swipeIntent(-30, 25), 'scroll');      // 斜向：偏向捲動
    assert.equal(swipeIntent(2, -40), 'scroll');
    assert.equal(swipeIntent(40, 2), 'scroll');        // 往右不處理
});
test('swipeThreshold：預設是卡片寬度的 40%', () => {
    assert.equal(swipeThreshold(350), 140);
    assert.equal(swipeThreshold(350, 0.5), 175);
});
test('swipeReached：扣掉判斷用的 slop 後，滑過 40% 才算數', () => {
    const w = 350, need = 140 + SWIPE_SLOP;
    assert.equal(swipeReached(-(need - 1), w), false);
    assert.equal(swipeReached(-need, w), true);
    assert.equal(swipeReached(60, w), false);          // 往右永遠不算
});
test('swipeOffset：過線前跟手、過線後阻尼、不超過卡片寬度、不往右', () => {
    const w = 350;
    assert.equal(swipeOffset(-SWIPE_SLOP, w), 0);                 // 剛好 slop：還沒開始移
    assert.equal(swipeOffset(-(SWIPE_SLOP + 100), w), 100);       // 過線前 1:1
    const past = swipeOffset(-(SWIPE_SLOP + 240), w);             // 過線 100px
    assert.ok(past > 140 && past < 240, String(past));
    assert.equal(swipeOffset(-5000, w), w);
    assert.equal(swipeOffset(30, w), 0);
});
