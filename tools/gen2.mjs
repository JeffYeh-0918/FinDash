// 開發用：依 modules_all.mjs 把 V14 的 setup() 拆成 js/features/*.js，並改寫 index.html。
// 用法：node --expose-internals tools/gen2.mjs <V14 的 index.html> <輸出專案資料夾>
import fs from 'node:fs';
import path from 'node:path';
import { loadSetup } from './stmts.mjs';

const [, , srcHtml, outRoot] = process.argv;
const { MODULES, REFIFY } = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), 'modules_all.mjs'));
const html = fs.readFileSync(srcHtml, 'utf8');
const { code, ast, setup, stmts } = loadSetup(srcHtml);
const VUE_API = ['ref', 'computed', 'watch', 'nextTick', 'provide', 'inject', 'onMounted', 'onUpdated', 'createApp'];
const errors = [];
const E = (m) => errors.push(m);

// ---------- 1. 前導註解、名稱索引 ----------
const bodyStart = setup.body.start + 1;
stmts.forEach((s, k) => { const prev = k === 0 ? bodyStart : stmts[k - 1].end; s.triviaStart = prev; s.comments = code.slice(prev, s.start).split('\n').map(l => l.trim()).filter(l => l.startsWith('//')); });
const stmtOf = {}; stmts.forEach(s => s.names.forEach(n => { stmtOf[n] = s; }));
const retStmt = stmts.find(s => s.st.type === 'ReturnStatement');

// ---------- 2. 指派陳述式 → 模組 ----------
stmts.forEach(s => { s.owner = null; });
const assign = (s, m, label) => { if (s.owner && s.owner !== m) E(`陳述式 ${label} 同時指派給 ${s.owner} 與 ${m}`); s.owner = m; };
for (const [m, d] of Object.entries(MODULES)) for (const n of d.names) {
    if (n.startsWith('~')) { const pre = n.slice(1); const hit = stmts.filter(s => !s.names.length && code.slice(s.start, s.start + 90).startsWith(pre)); if (hit.length !== 1) E(`選取器 ${n} 比對到 ${hit.length} 個陳述式`); else assign(hit[0], m, n); }
    else if (!stmtOf[n]) E(`找不到宣告：${m}.${n}`); else assign(stmtOf[n], m, n);
}
stmts.forEach(s => { if (s.st.type !== 'ReturnStatement' && !s.owner) s.owner = 'main'; });
stmts.forEach(s => { if (s.names.length > 1) { const ms = new Set(s.names.map(n => stmtOf[n].owner)); if (ms.size > 1) E(`同一陳述式的名稱被分到不同模組：${s.names}`); } });
const ownerOf = (n) => stmtOf[n] && stmtOf[n].owner;

// ---------- 3. 類型判斷 ----------
const kindOf = (n) => {
    if (REFIFY.includes(n)) return 'ref';
    const s = stmtOf[n]; if (!s) return null;
    if (s.st.type === 'FunctionDeclaration') return 'fn';
    if (s.st.type !== 'VariableDeclaration') return 'other';
    const d = s.st.declarations.find(x => x.id.type === 'Identifier' && x.id.name === n); if (!d || !d.init) return 'other';
    if (/Function/.test(d.init.type) || d.init.type === 'ArrowFunctionExpression') return 'fn';
    if (d.init.type === 'CallExpression' && d.init.callee.type === 'Identifier' && ['ref', 'computed'].includes(d.init.callee.name)) return 'ref';
    return 'other';
};

// ---------- 4. 每個模組的相依 ----------
const info = {}; const names = Object.keys(MODULES);
for (const m of names) {
    const own = stmts.filter(s => s.owner === m);
    const declared = new Set(own.flatMap(s => s.names));
    const ext = {};
    own.forEach(s => s.free.forEach(r => { if (declared.has(r.name)) return; const e = (ext[r.name] ||= { eager: false, uses: [] }); if (!r.deferred) e.eager = true; e.uses.push(r); }));
    info[m] = { own, declared, ext };
}
// 立即使用 → 必須先建立 → 排序
const deps = {}; names.forEach(m => { deps[m] = new Set(); Object.entries(info[m].ext).forEach(([n, e]) => { const o = ownerOf(n); if (o && o !== m && o !== 'main' && e.eager) deps[m].add(o); if (o === 'main') E(`${m} 使用留在主程式的名稱：${n}`); }); });
const order = [], st = {};
const visit = (m, stack) => { if (st[m] === 2) return; if (st[m] === 1) { E('立即相依的循環：' + [...stack, m].join(' → ')); return; } st[m] = 1; [...deps[m]].forEach(d => visit(d, [...stack, m])); st[m] = 2; order.push(m); };
names.forEach(m => visit(m, []));
const pos = Object.fromEntries(order.map((m, i) => [m, i]));

// ---------- 5. 分類外部名稱 ----------
const importSrc = {};
ast.body.filter(n => n.type === 'ImportDeclaration').forEach(n => n.specifiers.forEach(sp => { importSrc[sp.local.name] = { source: n.source.value, imported: sp.imported ? sp.imported.name : 'default', local: sp.local.name }; }));
for (const m of names) {
    const I = info[m]; I.vue = []; I.imps = []; I.eagerNames = []; I.fwd = [];
    for (const [n, e] of Object.entries(I.ext)) {
        if (REFIFY.includes(n) && ownerOf(n) !== m) { /* 下面當一般名稱處理 */ }
        if (VUE_API.includes(n)) I.vue.push(n);
        else if (importSrc[n]) I.imps.push(n);
        else if (ownerOf(n)) {
            const o = ownerOf(n);
            if (pos[o] < pos[m]) I.eagerNames.push(n);
            else {   // 之後才建立（循環或後面的模組）：只能延遲取用
                if (e.eager) { E(`${m} 立即使用較晚建立的模組(${o})的名稱：${n}`); continue; }
                const k = kindOf(n);
                if (k === 'fn') I.fwd.push({ n, k });
                else if (k === 'ref') {
                    if (!REFIFY.includes(n)) e.uses.forEach(u => { if (code.slice(u.end, u.end + 6) !== '.value') E(`${m} 以非 .value 方式使用較晚建立的 ref：${n}`); });
                    I.fwd.push({ n, k });
                } else E(`${m} 延遲使用的 ${n}（${o}）不是函式或 ref，無法以轉接方式取用`);
            }
        } else E(`${m} 找不到名稱的來源：${n}`);
    }
}
// 被外部使用的名稱 + 範本用的名稱
const usedOutside = {}; stmts.forEach(s => s.free.forEach(r => { const o = ownerOf(r.name); if (o && o !== s.owner && o !== 'main') (usedOutside[o] ||= new Set()).add(r.name); }));
const tmplNames = new Set(retStmt.free.map(r => r.name));
const exportsOf = {}; names.forEach(m => { exportsOf[m] = [...info[m].declared].filter(n => (usedOutside[m] && usedOutside[m].has(n)) || tmplNames.has(n)); });
// 範本用、但不是任何陳述式宣告的名稱（例如 import 進來的常數）：由主程式補進 ctx
const extras = [...tmplNames].filter(n => !stmtOf[n]);
// 主程式剩餘陳述式
const mainStmts = stmts.filter(s => s.owner === 'main');
const mainNeeds = new Set(); mainStmts.forEach(s => s.free.forEach(r => { if (ownerOf(r.name) && ownerOf(r.name) !== 'main') mainNeeds.add(r.name); }));
if (errors.length) { console.error('❌ 無法產生：\n - ' + [...new Set(errors)].join('\n - ')); process.exit(1); }

// ---------- 6. 文字產生 ----------
const tplLines = (node) => { const set = new Set(); const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n.type === 'TemplateLiteral') for (let l = n.loc.start.line + 1; l <= n.loc.end.line; l++) set.add(l); for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'type') walk(n[k]); }; walk(node); return set; };
const stmtText = (s) => {   // 套用 let→ref 轉換後的原文
    let text = code.slice(s.start, s.end);
    const reps = s.free.filter(r => REFIFY.includes(r.name)).map(r => [r.start - s.start, r.end - s.start, r.name + '.value']);
    reps.sort((a, b) => b[0] - a[0]).forEach(([a, b, t]) => { text = text.slice(0, a) + t + text.slice(b); });
    if (s.st.type === 'VariableDeclaration' && s.names.some(n => REFIFY.includes(n))) {
        if (s.st.kind !== 'let') throw new Error('REFIFY 只支援 let');
        text = 'const ' + s.st.declarations.map(d => `${d.id.name} = ref(${d.init ? code.slice(d.init.start, d.init.end) : 'undefined'})`).join(', ') + ';';
    }
    return text;
};
const indentStmt = (s, pad) => {
    const skip = tplLines(s.st), first = s.st.loc.start.line, lines = stmtText(s).split('\n');
    return lines.map((ln, i) => { if (i === 0) return pad + ln; if (skip.has(first + i)) return ln; const cut = 16 - pad.length; return ln.replace(/^ +/, sp => sp.slice(0, Math.max(0, sp.length - cut))); }).join('\n');
};
const fmt = (ns, ind, per = 6) => { const rows = []; for (let i = 0; i < ns.length; i += per) rows.push(ind + '    ' + ns.slice(i, i + per).join(', ')); return rows.join(',\n'); };
const toFeat = (src) => src.replace('./js/logic/', '../logic/').replace('./js/data/', '../data/');
const outDir = path.join(outRoot, 'js/features'); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
for (const m of order) {
    const d = MODULES[m], I = info[m];
    const byFile = {}; I.imps.forEach(n => { const im = importSrc[n]; (byFile[toFeat(im.source)] ||= []).push(im.imported === im.local ? im.local : `${im.imported} as ${im.local}`); });
    const vue = new Set(I.vue); if (I.own.some(s => s.names.some(n => REFIFY.includes(n)))) vue.add('ref');
    let out = `// FinDash 功能模組：${d.title}\n// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（其他模組提供的成員）。\n`;
    Object.entries(byFile).forEach(([f, ns]) => { out += `import { ${ns.join(', ')} } from '${f}';\n`; });
    out += '\n'; if (vue.size) out += `const { ${[...vue].join(', ')} } = Vue;\n\n`;
    out += `export const ${d.fn} = (ctx) => {\n`;
    if (I.eagerNames.length) out += `    // 取用前面模組已建立的成員\n    const {\n${fmt(I.eagerNames, '    ')}\n    } = ctx;\n\n`;
    if (I.fwd.length) {
        out += `    // 取用「較晚建立」的模組成員（模組之間互相呼叫）：用到的當下才去 ctx 找\n`;
        I.fwd.forEach(({ n, k }) => { out += k === 'fn' ? `    const ${n} = (...args) => ctx.${n}(...args);\n` : `    const ${n} = { get value() { return ctx.${n}.value; }, set value(v) { ctx.${n}.value = v; } };\n`; });
        out += '\n';
    }
    I.own.forEach(s => { s.comments.forEach(c => { out += '    ' + c + '\n'; }); out += indentStmt(s, '    ') + '\n'; });
    out += `\n    return {\n${fmt(exportsOf[m], '    ')}\n    };\n};\n`;
    fs.writeFileSync(path.join(outDir, d.file + '.js'), out);
}

// ---------- 7. 主程式 ----------
const IND = '                ';
let body = '\n' + IND + '// ================= 功能模組（js/features/）：依序建立，成員都放進共用環境 ctx =================\n' + IND + 'const ctx = {};\n';
order.forEach(m => { body += IND + `Object.assign(ctx, ${MODULES[m].fn}(ctx));\n`; });
if (extras.length) body += IND + `Object.assign(ctx, { ${extras.join(', ')} });   // 範本用到的 import 進來的常數\n`;
const mainNeedList = [...mainNeeds];
if (mainNeedList.length) body += '\n' + IND + 'const {\n' + fmt(mainNeedList, IND) + '\n' + IND + '} = ctx;\n';
mainStmts.forEach(s => { body += '\n'; s.comments.forEach(c => { body += IND + c + '\n'; }); body += IND + stmtText(s) + '\n'; });
body += '\n' + IND + '// 範本（HTML）會用到的成員。範本新增用到的名稱時，要加在這裡；npm run check 會檢查每一個都存在。\n';
body += IND + 'const TEMPLATE_MEMBERS = [\n' + fmt([...tmplNames].sort().map(n => `'${n}'`), IND, 5) + '\n' + IND + '];\n';
body += IND + 'return Object.fromEntries(TEMPLATE_MEMBERS.map(k => [k, ctx[k]]));\n            ';
let newCode = code.slice(0, setup.body.start + 1) + body + code.slice(setup.body.end - 1);
// 主程式 import：加入功能模組，並刪掉主程式已不再用到的 import
const impLines = order.map(m => `        import { ${MODULES[m].fn} } from './js/features/${MODULES[m].file}.js';`).join('\n');
newCode = newCode.replace(/(\n        import \{ renameInSettings as renameInSettingsOn)/, '\n' + impLines + '$1');
fs.writeFileSync(path.join(outRoot, '_main_script.tmp'), newCode);
let out = html.replace(code, () => newCode);
const mapAdd = order.map(m => `    "./js/features/${MODULES[m].file}.js": "./js/features/${MODULES[m].file}.js?v=1"`).join(',\n');
out = out.replace(/("\.\/js\/data\/sync\.js": "\.\/js\/data\/sync\.js\?v=1")/, `$1,\n${mapAdd}`);
fs.writeFileSync(path.join(outRoot, 'index.html'), out);
console.log('模組順序：', order.join(' → '));
order.forEach(m => console.log(`${m.padEnd(13)} 陳述式 ${String(info[m].own.length).padStart(3)}｜先建立的 ${String(info[m].eagerNames.length).padStart(2)}｜轉接 ${String(info[m].fwd.length).padStart(2)}｜對外 ${String(exportsOf[m].length).padStart(3)}`));
console.log('留在主程式的陳述式：', mainStmts.map(s => s.names.join('+') || code.slice(s.start, s.start + 20).replace(/\s+/g, ' ')).join('、'));
console.log('範本用但非宣告的名稱（主程式補進 ctx）：', extras.join(', ') || '無');
