import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');

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
    const opens = [...html.matchAll(/<transition name="fd-modal"[^>]*>\s*<div v-if="[^"]+" data-(modal|dialog)/g)].length;
    const all = [...html.matchAll(/<div v-if="[^"]+" data-(modal|dialog)/g)].length;
    assert.equal(all, 14);
    assert.equal(opens, all, '有彈窗沒包 transition，關閉時不會有退場動畫');
    const o = (html.match(/<transition(?=[\s>])/g) || []).length, c = (html.match(/<\/transition>/g) || []).length;
    assert.equal(o, c);
    assert.equal((html.match(/<transition-group\b/g) || []).length, (html.match(/<\/transition-group>/g) || []).length);
});
test('V25：切換按鈕都用滑塊（--n／--i），內容更新標記與滾動數字元件已註冊', () => {
    assert.ok(!html.includes('class="fd-seg"'), '舊的 .fd-seg 沒換掉');
    assert.equal((html.match(/class="fd-seg2[^"]*"/g) || []).length, 3);
    assert.equal((html.match(/class="fd-tabs2"/g) || []).length, 2);
    for (const k of ['month', 'invest', 'paymode', 'cattab', 'paytab', 'card']) assert.ok(html.includes('data-fd-refresh="' + k) || html.includes(k + '"') && html.includes('data-fd-refresh'), k);
    assert.match(html, /\.component\('fd-num', FdNum\)/);
    assert.ok((html.match(/<fd-num :value=/g) || []).length >= 10);
    assert.ok(!/<fd-num[^>]*\/>/.test(html), '行內範本的自訂元件不能用自閉合寫法');
});
test('V26：版本字樣、載入骨架、空狀態引導、持股卡字級', () => {
    assert.match(html, /var APP = 'V26\.1'/);
    assert.ok(html.includes('id="fd-boot"') && html.includes("getElementById('fd-boot')"), '骨架畫面或移除程式不見了');
    assert.ok(html.indexOf('id="fd-boot"') < html.indexOf('id="app"'), '骨架畫面必須在 #app 之外（#app 的內容會被 Vue 當範本）');
    assert.equal((html.match(/class="fd-val font-medium/g) || []).length, 4);
    assert.ok((html.match(/fd-empty-btn/g) || []).length >= 8);
    assert.ok(!/'Inter'/.test(css), '未載入的 Inter 字型宣告又出現了');
    assert.match(css, /font-variant-numeric: tabular-nums/);
});
test('V26：編輯視窗有刪除鈕（只在編輯時出現）、卡片提示文字含左滑刪除', () => {
    assert.match(html, /<button v-if="editingExpenseId" type="button" @click="deleteEditingExpense"/);
    assert.match(html, /<button v-if="editingStockId" type="button" @click="deleteEditingStock"/);
    assert.equal((html.match(/左滑刪除/g) || []).length, 2);
});
test('V26：左滑刪除的樣式存在，且卡片仍維持 touch-action: pan-y', () => {
    assert.match(css, /\.fdm-item\.is-swiping::before/);
    assert.match(css, /\.fdm-item\.is-ready::before/);
    assert.match(css, /\.fdm-item \{[^}]*touch-action: pan-y/);
});
test('範本裡的 Tailwind 工具類別都存在於 tailwind.css（它是預先編譯的，缺的類別不會生效，新樣式要寫進 app.css）', () => {
    const tw = fs.readFileSync(new URL('../css/tailwind.css', import.meta.url), 'utf8');
    const esc = (t) => t.replace(/([:/.\[\]%()#,])/g, '\\$1');
    const prefix = /^-?(?:(?:sm|md|lg|xl|hover|focus|active|disabled|group-hover):)*-?(?:flex|grid|gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space|text|font|bg|border|rounded|w|h|min|max|items|justify|shrink|grow|leading|whitespace|overflow|opacity|transition|ring|shadow|col|row|self|z|top|left|right|bottom|inset|tracking|divide|from|to|via)(?:-|$)/;
    const missing = new Set();
    for (const m of html.matchAll(/\sclass="([^"{}]*)"/g)) {
        for (const tok of m[1].split(/\s+/).filter(Boolean)) {
            if (!prefix.test(tok) || /^fd|^fdm|^fdd/.test(tok) || tok.includes('[')) continue;   // [..] 任意值的類別在編譯後會被轉義成別的寫法，這裡不比對
            if (!tw.includes('.' + esc(tok))) missing.add(tok);
        }
    }
    assert.deepEqual([...missing], []);
});
test('V26：自訂類別名稱不可和既有的撞名（.fd-kv 是別處在用的 flex 排版，不能拿來當網格）', () => {
    assert.ok(!/class="fd-kv grid/.test(html));
    assert.equal((css.match(/^\.fd-kv \{/gm) || []).length, 1, '.fd-kv 只應該定義一次');
    // 頂層（不在 @media 裡）規則：同一個 .fd- 類別若有兩條都設了 display，後面的會蓋掉前面的，多半是撞名
    const top = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    const dup = [];
    for (const name of new Set([...top.matchAll(/^\.(fd[\w-]*) \{[^}]*\bdisplay:/gm)].map(m => m[1]))) {
        const n = [...top.matchAll(new RegExp('^\\.' + name + ' \\{[^}]*\\bdisplay:', 'gm'))].length;
        if (n > 1) dup.push(name);
    }
    assert.deepEqual(dup, []);
});
test('V26：持股卡標題列是「代碼｜現價／名稱｜價格」的 2×2 網格；液態切換的樣式與重播程式都在', () => {
    assert.match(html, /<div class="fd-hold-head">/);
    assert.match(css, /\.fd-hold-name \{[^}]*align-self: baseline/);
    assert.match(css, /\.fd-seg2\.is-liquid::before \{ animation: fd-liquid/);
    assert.match(css, /@keyframes fd-liquid/);
    const m = fs.readFileSync(new URL('../js/features/motion.js', import.meta.url), 'utf8');
    assert.ok(m.includes("is-liquid") && m.includes("data-dir"));
});
