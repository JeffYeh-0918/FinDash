// 靜態檢查「功能模組的介面契約」。用法：node --expose-internals tools/contract.mjs
//  1. 每個模組開頭 const { … } = ctx 取用的成員，呼叫當下 ctx 裡都已存在（前面的模組已提供）
//  2. 模組用 ctx.xxx 延遲取用的成員（轉接），最後 ctx 裡一定有
//  3. 範本用到的成員（tools/template-members.json）最後 ctx 裡都有
//  4. 主程式自己 const { … } = ctx 取用的成員都有
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, freeRefs } from './scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainAst = parse(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
const keysOf = (obj) => obj.properties.filter(p => p.type === 'Property').map(p => p.key.name);
const patKeys = (pat) => pat.properties.map(p => p.key.name);
const fnFile = {};
mainAst.body.filter(n => n.type === 'ImportDeclaration' && /features\//.test(n.source.value)).forEach(n => n.specifiers.forEach(s => { fnFile[s.local.name] = n.source.value; }));

const cands = [];
(function find(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(find); if (n.type === 'Property' && n.key && n.key.name === 'setup') cands.push(n.value.body.body); for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'type') find(n[k]); })(mainAst);
const setupBody = cands.sort((a, b) => b.length - a.length)[0];

const ctxKeys = new Set(); let bad = 0; const fail = (m) => { bad++; console.log('❌ ' + m); };
const lateRefs = [];   // { file, name }
const isCtxCall = (e) => e && e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.object.name === 'Object' && e.callee.property.name === 'assign' && e.arguments[0] && e.arguments[0].name === 'ctx';
for (const st of setupBody) {
    if (st.type === 'ExpressionStatement' && isCtxCall(st.expression)) {
        const arg = st.expression.arguments[1];
        if (arg.type === 'ObjectExpression') { keysOf(arg).forEach(k => ctxKeys.add(k)); continue; }
        if (arg.type === 'CallExpression' && arg.callee.type === 'Identifier' && fnFile[arg.callee.name]) {
            const fn = arg.callee.name, file = path.join(root, fnFile[fn]);
            const mast = parse(fs.readFileSync(file, 'utf8')); let body = null;
            mast.body.forEach(n => { if (n.type === 'ExportNamedDeclaration' && n.declaration) n.declaration.declarations.forEach(dd => { if (dd.id.name === fn) body = dd.init.body.body; }); });
            if (!body) { fail(`${fn}：在 ${path.basename(file)} 找不到`); continue; }
            const need = []; body.forEach(s => { if (s.type === 'VariableDeclaration') s.declarations.forEach(dd => { if (dd.init && dd.init.name === 'ctx' && dd.id.type === 'ObjectPattern') need.push(...patKeys(dd.id)); }); });
            const ret = body.find(s => s.type === 'ReturnStatement'); const provided = ret ? keysOf(ret.argument) : [];
            need.filter(n => !ctxKeys.has(n)).forEach(n => fail(`${path.basename(file)} 需要 ctx.${n}，但呼叫當下前面的模組還沒提供`));
            provided.filter(n => ctxKeys.has(n)).forEach(n => fail(`${path.basename(file)} 提供的 ${n} 與前面模組重複`));
            // 模組函式的參數 ctx 以外的 ctx（例如 Canvas 的 ctx）不算：只看「沒有被內層宣告」的 ctx 參照
            const src = fs.readFileSync(file, 'utf8');
            freeRefs(body).filter(r => r.name === 'ctx').forEach(r => { const m = src.slice(r.end).match(/^\.([A-Za-z_$][\w$]*)/); if (m) lateRefs.push({ file: path.basename(file), name: m[1] }); });
            provided.forEach(k => ctxKeys.add(k));
            console.log(`✅ ${fn.padEnd(16)} 先建立的 ${String(need.length).padStart(2)} 項｜提供 ${String(provided.length).padStart(3)} 項`);
        }
        continue;
    }
    if (st.type === 'VariableDeclaration') st.declarations.forEach(d => { if (d.init && d.init.name === 'ctx' && d.id.type === 'ObjectPattern') patKeys(d.id).forEach(n => { if (!ctxKeys.has(n)) fail(`主程式取用 ctx.${n}，但沒有任何模組提供`); }); });
}
lateRefs.forEach(({ file, name }) => { if (!ctxKeys.has(name)) fail(`${file} 以 ctx.${name} 延遲取用，但最後沒有任何模組提供`); });
let tpl = [];
setupBody.forEach(st => { if (st.type === 'VariableDeclaration') st.declarations.forEach(d => { if (d.id.name === 'TEMPLATE_MEMBERS') tpl = d.init.elements.map(e => e.value); }); });
if (!tpl.length) fail('主程式找不到 TEMPLATE_MEMBERS 名單');
tpl.filter((n, i) => tpl.indexOf(n) !== i).forEach(n => fail(`TEMPLATE_MEMBERS 有重複：${n}`));
tpl.filter(n => !ctxKeys.has(n)).forEach(n => fail(`範本用到的 ${n} 沒有被提供`));
console.log(`範本成員 ${tpl.length} 個（全部存在），ctx 共 ${ctxKeys.size} 個`);
if (bad) { console.error(`\n共 ${bad} 項介面問題`); process.exit(1); }
console.log('\n介面契約全部通過');
