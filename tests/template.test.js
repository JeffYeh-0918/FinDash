import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('根容器 <div id="app"> 不可有動態綁定或指令（Vue 行內範本只編譯它的內容，不會編譯它自己的屬性）', () => {
    const tag = html.match(/<div id="app"[^>]*>/)[0];
    const attrs = [...tag.matchAll(/\s([:@#]?[\w.:-]+)(?==|\s|>)/g)].map(m => m[1]).filter(a => a !== 'id');
    const bad = attrs.filter(a => /^[:@#]|^v-/.test(a) && a !== 'v-cloak');
    assert.deepEqual(bad, [], '根容器上有不會生效的綁定：' + bad.join(', '));
});
test('版面容器 .fd-app 的展開狀態 class 綁在 #app 裡面那一層', () => {
    assert.match(html, /<div class="fd-app" :class="\{ 'fd-wide': navWide \}">/);
});
test('手機／平板的底部導覽與扇形選單存在，舊的浮動按鈕已移除', () => {
    assert.match(html, /class="fd-fan"/);
    assert.ok(!html.includes('fdm-fab'));
});
test('V25：14 個彈窗（含確認視窗）都包在 <transition name="fd-modal"> 裡，開關標籤成對', () => {
    const opens = [...html.matchAll(/<transition name="fd-modal">\s*<div v-if="[^"]+" data-(modal|dialog)/g)].length;
    const all = [...html.matchAll(/<div v-if="[^"]+" data-(modal|dialog)/g)].length;
    assert.equal(all, 14);
    assert.equal(opens, all, '有彈窗沒包 transition，關閉時不會有退場動畫');
    const o = (html.match(/<transition(?=[\s>])/g) || []).length, c = (html.match(/<\/transition>/g) || []).length;
    assert.equal(o, c);
    assert.equal((html.match(/<transition-group\b/g) || []).length, (html.match(/<\/transition-group>/g) || []).length);
});
