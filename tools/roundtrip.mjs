// 拆檔前後比對：舊版 index.html 的每個 setup() 宣告，原文（忽略空白）是否都在新檔案裡。
// 用法：node --expose-internals tools/roundtrip.mjs <舊 index.html> <新專案資料夾>
import fs from 'node:fs';
import path from 'node:path';
import { loadSetup } from './stmts.mjs';
const [, , oldHtml, newRoot] = process.argv;
const strip = (s) => s.replace(/\s+/g, '');
const old = loadSetup(oldHtml), nu = loadSetup(path.join(newRoot, 'index.html'));
const featDir = path.join(newRoot, 'js/features');
const pool = strip(nu.code) + fs.readdirSync(featDir).map(f => strip(fs.readFileSync(path.join(featDir, f), 'utf8'))).join('|');
const mismatched = [];
let total = 0;
for (const s of old.stmts) {
    if (s.st.type === 'ReturnStatement') continue; total++;
    if (!pool.includes(strip(old.code.slice(s.start, s.end)))) mismatched.push(s.names.join(',') || old.code.slice(s.start, s.start + 50).replace(/\s+/g, ' '));
}
console.log(`舊版 ${total} 個陳述式（不含 return）：${total - mismatched.length} 個原文完整保留，${mismatched.length} 個有差異`);
mismatched.forEach(m => console.log('  差異：', m));
// 範本成員：新舊必須完全相同
const oldRet = old.stmts.at(-1); const oldNames = [...new Set(oldRet.free.map(r => r.name))].sort();
let newNames = []; nu.setup.body.body.forEach(st => { if (st.type === 'VariableDeclaration') st.declarations.forEach(d => { if (d.id.name === 'TEMPLATE_MEMBERS') newNames = d.init.elements.map(e => e.value).sort(); }); });
console.log('範本成員名單新舊是否完全相同：', JSON.stringify(oldNames) === JSON.stringify(newNames), `（${oldNames.length} 個）`);
