// 開發用：依 modules_*.mjs 的分組，把 setup() 裡的宣告原文搬到 js/features/*.js，並改寫 index.html。
// 用法：node --expose-internals tools/gen_features.mjs <來源 html> <輸出資料夾> <modules 檔名>
import fs from 'node:fs';
import path from 'node:path';
import { loadSetup } from './stmts.mjs';
import { BROWSER_GLOBALS } from './scope.mjs';

const [, , srcHtml, outDir, modFile] = process.argv;
const { MODULES } = await import(path.resolve(modFile));
const html = fs.readFileSync(srcHtml, 'utf8');
const { code, ast, setup, stmts, imported } = loadSetup(srcHtml);
const VUE_API = ['ref', 'computed', 'watch', 'nextTick', 'provide', 'inject', 'onMounted', 'onUpdated', 'createApp'];
const errors = [];
const fmt = (names, ind, per = 6) => { const rows = []; for (let i = 0; i < names.length; i += per) rows.push(ind + '    ' + names.slice(i, i + per).join(', ')); return rows.join(',\n'); };

// 1) 每個陳述式的前導註解
const bodyStart = setup.body.start + 1;
stmts.forEach((s, k) => {
    const prevEnd = k === 0 ? bodyStart : stmts[k - 1].end;
    s.triviaStart = prevEnd;
    s.comments = code.slice(prevEnd, s.start).split('\n').map(l => l.trim()).filter(l => l.startsWith('//'));
});
const declKind = (s) => s.st.type === 'VariableDeclaration' ? s.st.kind : (s.st.type === 'FunctionDeclaration' ? 'function' : 'other');
const stmtOf = {}; stmts.forEach(s => s.names.forEach(n => { stmtOf[n] = s; }));
const modOf = {}; Object.entries(MODULES).forEach(([m, d]) => d.names.forEach(n => { if (!stmtOf[n]) errors.push(`找不到宣告：${m}.${n}`); modOf[n] = m; }));
stmts.forEach(s => { const ms = new Set(s.names.map(n => modOf[n] || 'main')); if (ms.size > 1) errors.push(`同一陳述式橫跨多個群組：${s.names.join(',')} → ${[...ms]}`); });
stmts.forEach(s => { s.owner = s.names.length ? (modOf[s.names[0]] || 'main') : 'main'; });

// 2) 匯入來源對照（名稱 → 模組路徑）
const importSrc = {};
ast.body.filter(n => n.type === 'ImportDeclaration').forEach(n => n.specifiers.forEach(sp => { importSrc[sp.local.name] = { source: n.source.value, imported: sp.imported ? sp.imported.name : 'default', local: sp.local.name }; }));

// 3) 各模組的外部相依
const info = {};
for (const [m, d] of Object.entries(MODULES)) {
    const own = stmts.filter(s => s.owner === m);
    const declared = new Set(own.flatMap(s => s.names));
    const ext = {};   // name → { eager, assigned }
    own.forEach(s => s.free.forEach(r => { if (declared.has(r.name)) return; const e = (ext[r.name] ||= { eager: false, assigned: false }); if (!r.deferred) e.eager = true; if (r.assigned) e.assigned = true; }));
    const vue = [], imps = [], fromMain = [], fromMods = {};
    for (const [n, f] of Object.entries(ext)) {
        if (VUE_API.includes(n)) vue.push(n);
        else if (importSrc[n]) imps.push(n);
        else if (stmtOf[n]) {
            const o = stmtOf[n].owner;
            if (f.assigned) errors.push(`${m} 對外部變數重新賦值：${n}（${o}）`);
            if (o === 'main') { if (declKind(stmtOf[n]) === 'let') errors.push(`${m} 使用主程式的 let 變數：${n}`); fromMain.push(n); }
            else (fromMods[o] ||= []).push(n);
        } else errors.push(`${m} 找不到名稱的來源：${n}`);
    }
    info[m] = { own, declared, vue, imps, fromMain, fromMods };
}
// 4) 模組順序（依賴者在後），偵測循環
const order = []; const state = {};
const visit = (m, stack = []) => { if (state[m] === 2) return; if (state[m] === 1) { errors.push('模組循環相依：' + [...stack, m].join(' → ')); return; } state[m] = 1; Object.keys(info[m].fromMods).forEach(d => visit(d, [...stack, m])); state[m] = 2; order.push(m); };
Object.keys(MODULES).forEach(m => visit(m));

// 5) 每個模組對外提供的名稱：被主程式或其他模組使用（含 return 範本用）
const usedOutside = {};
stmts.forEach(s => s.free.forEach(r => { const o = stmtOf[r.name]; if (o && o.owner !== s.owner && o.owner !== 'main') (usedOutside[o.owner] ||= new Set()).add(r.name); }));
const retNames = new Set(); // 範本用的名稱（return 物件）
const retStmt = stmts.find(s => s.st.type === 'ReturnStatement');
retStmt.free.forEach(r => retNames.add(r.name));
const exportsOf = {};
for (const m of Object.keys(MODULES)) exportsOf[m] = [...info[m].declared].filter(n => (usedOutside[m] && usedOutside[m].has(n)) || retNames.has(n));
// 模組內宣告但完全沒人用的名稱：仍保留在模組內（不輸出）
if (errors.length) { console.error('❌ 無法產生：\n - ' + errors.join('\n - ')); process.exit(1); }

// 6) 產生模組檔
const tplLines = (st) => { const set = new Set(); const walk = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if (n.type === 'TemplateLiteral') { for (let l = n.loc.start.line + 1; l <= n.loc.end.line; l++) set.add(l); } for (const k of Object.keys(n)) if (k !== 'loc' && k !== 'type') walk(n[k]); }; walk(st); return set; };
const indentText = (s) => {
    const skip = tplLines(s.st);
    const lines = code.slice(s.start, s.end).split('\n');
    const first = s.st.loc.start.line;
    return lines.map((ln, i) => {
        if (i === 0) return '    ' + ln;
        if (skip.has(first + i)) return ln;
        return ln.startsWith(' '.repeat(12)) ? ln.slice(12) : ln.replace(/^ +/, (sp) => sp.slice(0, Math.max(0, sp.length - 12)));
    }).join('\n');
};
fs.mkdirSync(outDir, { recursive: true });
const toFeatureImport = (src) => src.replace('./js/logic/', '../logic/').replace('./js/data/', '../data/');
for (const m of order) {
    const d = MODULES[m], I = info[m];
    const importsByFile = {};
    I.imps.forEach(n => { const im = importSrc[n]; (importsByFile[toFeatureImport(im.source)] ||= []).push(im.imported === im.local ? im.local : `${im.imported} as ${im.local}`); });
    let out = `// FinDash 功能模組：${d.title}\n// 由 index.html 的 setup() 原文搬出；ctx 是共用環境（主程式與其他模組的成員）。\n`;
    Object.entries(importsByFile).forEach(([f, ns]) => { out += `import { ${ns.join(', ')} } from '${f}';\n`; });
    out += '\n';
    if (I.vue.length) out += `const { ${I.vue.join(', ')} } = Vue;\n\n`;
    out += `export const ${d.fn} = (ctx) => {\n`;
    const need = [...I.fromMain, ...Object.values(I.fromMods).flat()];
    if (need.length) out += `    const { ${need.join(', ')} } = ctx;\n\n`;
    I.own.forEach(s => { s.comments.forEach(c => { out += '    ' + c + '\n'; }); out += indentText(s) + '\n'; });
    out += `\n    return { ${exportsOf[m].join(', ')} };\n};\n`;
    fs.writeFileSync(path.join(outDir, d.file + '.js'), out);
}

// 7) 改寫 index.html 主程式：移除已搬走的陳述式，在 return 之前接上各模組
const removeRanges = stmts.filter(s => s.owner !== 'main').map(s => [s.triviaStart, s.end]);
let newCode = code, shift = 0;
// 由後往前移除，避免位置位移
const kept = removeRanges.sort((a, b) => b[0] - a[0]);
const retStart = retStmt.start;
const neededFromMain = [...new Set(order.flatMap(m => info[m].fromMain))];
let block = '// ================= 功能模組（js/features/）：把共用環境交給各模組，取回它們對外提供的成員 =================\n';
const IND = '                ';
block += IND + 'const ctx = {\n' + fmt(neededFromMain, IND) + '\n' + IND + '};\n';
for (const m of order) {
    const ex = exportsOf[m];
    block += IND + 'const {\n' + fmt(ex, IND) + '\n' + IND + `} = ${MODULES[m].fn}(ctx);\n`;
    block += IND + 'Object.assign(ctx, {\n' + fmt(ex, IND) + '\n' + IND + '});\n';
}
block += '\n                ';
newCode = code.slice(0, retStart) + block + code.slice(retStart);
// 移除（先移除位置在 return 之後的？沒有，全在 return 之前）
for (const [a, b] of kept) newCode = newCode.slice(0, a) + newCode.slice(b);
// import 行
const impLines = order.map(m => `        import { ${MODULES[m].fn} } from './js/features/${MODULES[m].file}.js';`).join('\n');
newCode = newCode.replace(/(\n        import \{ renameInSettings as renameInSettingsOn)/, '\n' + impLines + '$1');
let out = html.replace(code, () => newCode);
// import map
const mapAdd = order.map(m => `    "./js/features/${MODULES[m].file}.js": "./js/features/${MODULES[m].file}.js?v=1"`).join(',\n');
out = out.replace(/("\.\/js\/data\/sync\.js": "\.\/js\/data\/sync\.js\?v=1")/, `$1,\n${mapAdd}`);
fs.writeFileSync(process.argv[5] || 'index_new.html', out);
console.log('模組順序：', order.join(' → '));
order.forEach(m => console.log(`${m}: ${info[m].own.length} 個陳述式；取自主程式 ${info[m].fromMain.length}、取自其他模組 ${Object.values(info[m].fromMods).flat().length}；對外提供 ${exportsOf[m].length}`));
console.log('ctx 需要的主程式成員：', neededFromMain.length);
