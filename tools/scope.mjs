// 開發用工具：用 Node 內建的 acorn 做「作用域感知」的外部變數分析。
// 執行時需要：node --expose-internals ...（Node 內建 acorn，不用另外安裝）
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const acorn = require('internal/deps/acorn/acorn/dist/acorn');

export const parse = (code) => acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });

// 取出 pattern 內宣告的名稱
const patNames = (p, out = []) => {
    if (!p) return out;
    switch (p.type) {
        case 'Identifier': out.push(p.name); break;
        case 'ObjectPattern': p.properties.forEach(x => patNames(x.type === 'RestElement' ? x.argument : x.value, out)); break;
        case 'ArrayPattern': p.elements.forEach(x => patNames(x, out)); break;
        case 'AssignmentPattern': patNames(p.left, out); break;
        case 'RestElement': patNames(p.argument, out); break;
    }
    return out;
};
// 一個區塊（陳述式清單）層級宣告的名稱：let/const/class/function，以及 var（含巢狀區塊內的 var）
const varNames = (node, out) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => varNames(n, out)); return; }
    if (node.type === 'VariableDeclaration' && node.kind === 'var') node.declarations.forEach(d => patNames(d.id, out));
    if (/Function|Arrow/.test(node.type)) return;       // 不進入巢狀函式
    for (const k of Object.keys(node)) if (k !== 'type' && node[k] && typeof node[k] === 'object') varNames(node[k], out);
};
const blockDecls = (stmts) => {
    const out = new Set();
    stmts.forEach(s => {
        if (s.type === 'VariableDeclaration' && s.kind !== 'var') s.declarations.forEach(d => patNames(d.id).forEach(n => out.add(n)));
        else if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') out.add(s.id.name);
        else if (s.type === 'ExportNamedDeclaration' && s.declaration) blockDecls([s.declaration]).forEach(n => out.add(n));
    });
    return out;
};

// 回傳 { name, start, end, shorthand } 陣列：在 root 範圍內沒有被宣告的識別字參照
// root：任一 AST 節點（或節點陣列）；predeclared：視為已宣告的名稱
export const freeRefs = (root, predeclared = []) => {
    const refs = [];
    let fnDepth = 0;
    const scopes = [new Set(predeclared)];
    const isDeclared = (n) => scopes.some(s => s.has(n));
    const ref = (id, shorthand = false) => { if (!isDeclared(id.name)) refs.push({ name: id.name, start: id.start, end: id.end, shorthand, deferred: fnDepth > 0 }); };
    const withScope = (names, fn) => { scopes.push(new Set(names)); try { fn(); } finally { scopes.pop(); } };
    const visitPattern = (p) => {   // 只處理 pattern 內的預設值與計算鍵（宣告本身已收集）
        if (!p) return;
        switch (p.type) {
            case 'ObjectPattern': p.properties.forEach(x => { if (x.type === 'RestElement') visitPattern(x.argument); else { if (x.computed) visit(x.key); visitPattern(x.value); } }); break;
            case 'ArrayPattern': p.elements.forEach(visitPattern); break;
            case 'AssignmentPattern': visitPattern(p.left); visit(p.right); break;
            case 'RestElement': visitPattern(p.argument); break;
            case 'MemberExpression': visit(p); break;
        }
    };
    const visitBlock = (stmts) => withScope(blockDecls(stmts), () => stmts.forEach(visit));
    const visitFunction = (n) => {
        const names = []; n.params.forEach(p => patNames(p, names));
        if (n.type === 'FunctionExpression' && n.id) names.push(n.id.name);
        names.push('arguments');
        fnDepth++;
        withScope(names, () => {
            n.params.forEach(visitPattern);
            if (n.body.type === 'BlockStatement') {
                const vars = []; varNames(n.body.body, vars);
                withScope(vars, () => visitBlock(n.body.body));
            } else visit(n.body);
        });
        fnDepth--;
    };
    const visit = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(visit); return; }
        switch (n.type) {
            case 'Identifier': ref(n); return;
            case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': visitFunction(n); return;
            case 'ClassDeclaration': case 'ClassExpression': withScope(n.id ? [n.id.name] : [], () => { visit(n.superClass); n.body.body.forEach(m => { if (m.computed) visit(m.key); visit(m.value); }); }); return;
            case 'BlockStatement': visitBlock(n.body); return;
            case 'MemberExpression': visit(n.object); if (n.computed) visit(n.property); return;
            case 'Property': if (n.computed) visit(n.key); if (n.shorthand) ref(n.value, true); else visit(n.value); return;
            case 'MethodDefinition': case 'PropertyDefinition': if (n.computed) visit(n.key); visit(n.value); return;
            case 'AssignmentExpression': case 'UpdateExpression': {
                const t = n.type === 'AssignmentExpression' ? n.left : n.argument;
                if (t.type === 'Identifier') { const before = refs.length; ref(t); if (refs.length > before) refs[refs.length - 1].assigned = true; } else visitPattern(t.type === 'MemberExpression' ? t : t);
                if (n.right) visit(n.right); return;
            }
            case 'LabeledStatement': visit(n.body); return;
            case 'BreakStatement': case 'ContinueStatement': return;
            case 'VariableDeclaration': n.declarations.forEach(d => { visitPattern(d.id); visit(d.init); }); return;
            case 'ForStatement': { const names = n.init && n.init.type === 'VariableDeclaration' && n.init.kind !== 'var' ? n.init.declarations.flatMap(d => patNames(d.id)) : []; withScope(names, () => { visit(n.init); visit(n.test); visit(n.update); visit(n.body); }); return; }
            case 'ForInStatement': case 'ForOfStatement': { const names = n.left.type === 'VariableDeclaration' && n.left.kind !== 'var' ? n.left.declarations.flatMap(d => patNames(d.id)) : []; withScope(names, () => { visit(n.left.type === 'VariableDeclaration' ? null : n.left); visit(n.right); visit(n.body); }); return; }
            case 'CatchClause': withScope(patNames(n.param), () => { visitPattern(n.param); visit(n.body); }); return;
            case 'SwitchStatement': visit(n.discriminant); withScope(blockDecls(n.cases.flatMap(c => c.consequent)), () => n.cases.forEach(c => { visit(c.test); c.consequent.forEach(visit); })); return;
            case 'ImportDeclaration': return;
            case 'ExportNamedDeclaration': visit(n.declaration); return;
            case 'TemplateLiteral': n.expressions.forEach(visit); return;
        }
        for (const k of Object.keys(n)) if (k !== 'type' && k !== 'loc' && n[k] && typeof n[k] === 'object') visit(n[k]);
    };
    const arr = Array.isArray(root) ? root : [root];
    // 最上層區塊也要先收集宣告（const/let/function 與 var）
    const top = root.type === 'Program' ? root.body : arr;
    const vars = []; varNames(top, vars);
    withScope([...blockDecls(top), ...vars], () => top.forEach(visit));
    return refs;
};

export const BROWSER_GLOBALS = new Set(('window document localStorage sessionStorage navigator console Math Object Array String Number Boolean Date JSON Set Map WeakMap Promise Symbol RegExp Error TypeError isFinite isNaN parseInt parseFloat setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame fetch URL Blob FileReader Intl undefined NaN Infinity globalThis Vue Chart XLSX lucide alert confirm prompt getComputedStyle matchMedia ResizeObserver MutationObserver encodeURIComponent decodeURIComponent structuredClone Event CustomEvent HTMLElement FormData Image Uint8Array ArrayBuffer DataView TextEncoder TextDecoder btoa atob File Node KeyboardEvent').split(' '));
