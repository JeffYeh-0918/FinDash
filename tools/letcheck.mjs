// 檢查：功能模組裡的 let 變數不可以被 return（會變成「值的複製」，之後的變動別人看不到）。
// 用法：node --expose-internals tools/letcheck.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './scope.mjs';

const DIR = fileURLToPath(new URL('../js/features', import.meta.url));
let bad = 0;
for (const f of fs.readdirSync(DIR).filter(n => n.endsWith('.js'))) {
    const ast = parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    let body = null;
    ast.body.forEach(n => { if (n.type === 'ExportNamedDeclaration' && n.declaration) body = n.declaration.declarations[0].init.body.body; });
    const lets = body.filter(s => s.type === 'VariableDeclaration' && s.kind === 'let').flatMap(s => s.declarations.map(d => d.id.name));
    const ret = body.find(s => s.type === 'ReturnStatement').argument.properties.map(p => p.key.name);
    const exported = lets.filter(n => ret.includes(n));
    if (exported.length) { bad++; console.log(`❌ ${f}：let 變數被匯出 → ${exported.join(', ')}`); }
}
if (bad) process.exit(1);
console.log('✅ 功能模組內的 let 變數都沒有對外匯出');
