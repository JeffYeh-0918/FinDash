// 靜態檢查「功能模組的介面契約」：
//  1. 模組開頭 const { … } = ctx 需要的成員，在呼叫當下 ctx 裡都已存在
//  2. 主程式 const { … } = useXxx(ctx) 取用的成員，模組的 return 都有提供
// 用法：node --expose-internals tools/contract.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from './scope.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainAst = parse(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
const keysOf = (obj) => obj.properties.filter(p => p.type === 'Property').map(p => p.key.name);
const patKeys = (pat) => pat.properties.map(p => p.key.name);
const fnFile = {};
mainAst.body.filter(n => n.type === 'ImportDeclaration' && /features\//.test(n.source.value)).forEach(n => n.specifiers.forEach(s => { fnFile[s.local.name] = n.source.value; }));

// 找主程式 setup 本體
let setupBody = null; const cands = [];
(function find(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(find); if (n.type === 'Property' && n.key && n.key.name === 'setup') cands.push(n.value.body.body); for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'type') find(n[k]); })(mainAst);
setupBody = cands.sort((a, b) => b.length - a.length)[0];

let ctxKeys = new Set(), bad = 0; const fail = (m) => { bad++; console.log('❌ ' + m); };
for (const st of setupBody) {
    if (st.type === 'VariableDeclaration') {
        for (const d of st.declarations) {
            if (d.id.type === 'Identifier' && d.id.name === 'ctx' && d.init && d.init.type === 'ObjectExpression') ctxKeys = new Set(keysOf(d.init));
            if (d.init && d.init.type === 'CallExpression' && d.init.callee.type === 'Identifier' && fnFile[d.init.callee.name] && d.id.type === 'ObjectPattern') {
                const fn = d.init.callee.name, want = patKeys(d.id);
                const file = path.join(root, fnFile[fn].replace(/\?.*$/, ''));
                const mast = parse(fs.readFileSync(file, 'utf8'));
                let body = null;
                mast.body.forEach(n => { if (n.type === 'ExportNamedDeclaration' && n.declaration) n.declaration.declarations.forEach(dd => { if (dd.id.name === fn) body = dd.init.body.body; }); });
                if (!body) { fail(`${fn}：在 ${path.basename(file)} 找不到`); continue; }
                const need = []; body.forEach(s => { if (s.type === 'VariableDeclaration') s.declarations.forEach(dd => { if (dd.init && dd.init.type === 'Identifier' && dd.init.name === 'ctx' && dd.id.type === 'ObjectPattern') need.push(...patKeys(dd.id)); }); });
                const ret = body.find(s => s.type === 'ReturnStatement'); const provided = new Set(ret ? keysOf(ret.argument) : []);
                need.filter(n => !ctxKeys.has(n)).forEach(n => fail(`${path.basename(file)} 需要 ctx.${n}，但呼叫當下 ctx 裡還沒有`));
                want.filter(n => !provided.has(n)).forEach(n => fail(`主程式向 ${fn} 取用 ${n}，但 ${path.basename(file)} 的 return 沒有提供`));
                console.log(`${bad ? '' : '✅ '}${fn}：需要 ${need.length} 項、提供 ${provided.size} 項、主程式取用 ${want.length} 項`);
            }
        }
    }
    if (st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' && st.expression.callee.type === 'MemberExpression' && st.expression.callee.object.name === 'Object' && st.expression.callee.property.name === 'assign' && st.expression.arguments[0].name === 'ctx')
        keysOf(st.expression.arguments[1]).forEach(k => ctxKeys.add(k));
}
if (bad) { console.error(`\n共 ${bad} 項介面問題`); process.exit(1); }
console.log('\n介面契約全部通過');
