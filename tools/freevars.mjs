// 靜態檢查：index.html 主程式與所有 js/ 模組裡，有沒有「用到卻沒宣告」的變數。
// 用法：node --expose-internals tools/freevars.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, freeRefs, BROWSER_GLOBALS } from './scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!['node_modules', 'tests', 'tools', '.git'].includes(e.name)) walk(p); } else if (e.name.endsWith('.js')) files.push(p);
});
walk(path.join(root, 'js'));
const sources = files.map(f => [path.relative(root, f), fs.readFileSync(f, 'utf8')]);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
sources.push(['index.html（主程式）', html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]]);

let bad = 0;
for (const [name, code] of sources) {
    const ast = parse(code);
    const imported = ast.body.filter(n => n.type === 'ImportDeclaration').flatMap(n => n.specifiers.map(s => s.local.name));
    const free = freeRefs(ast, imported).filter(r => !BROWSER_GLOBALS.has(r.name));
    const uniq = [...new Set(free.map(r => r.name))];
    if (uniq.length) { bad += uniq.length; console.log(`❌ ${name}：未宣告的變數 → ${uniq.join(', ')}`); }
    else console.log(`✅ ${name}`);
}
if (bad) { console.error(`\n共 ${bad} 個未宣告的變數`); process.exit(1); }
console.log('\n全部通過：沒有未宣告的變數');
