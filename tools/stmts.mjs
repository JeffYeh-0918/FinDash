// 開發用：列出 setup() 的所有頂層陳述式（名稱、行數、外部參照、是否立即使用）
import fs from 'node:fs';
import { parse, freeRefs, BROWSER_GLOBALS } from './scope.mjs';
export const loadSetup = (htmlPath) => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
    const code = m[1], offset = m.index + m[0].indexOf(code);
    const ast = parse(code);
    let setup = null; const all = [];
    const find = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(find); return; }
        if (n.type === 'Property' && n.key && n.key.name === 'setup' && n.value.type === 'FunctionExpression') { all.push(n.value); }
        for (const k of Object.keys(n)) if (k !== 'type' && k !== 'loc') find(n[k]); };
    find(ast);
    setup = all.sort((a, b) => b.body.body.length - a.body.body.length)[0];
    const imported = ast.body.filter(n => n.type === 'ImportDeclaration').flatMap(n => n.specifiers.map(s => s.local.name));
    const names = (st) => st.type === 'VariableDeclaration' ? st.declarations.flatMap(d => { const out = []; const pn = (p) => { if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(x => pn(x.value || x.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(x => x && pn(x)); }; pn(d.id); return out; }) : st.type === 'FunctionDeclaration' ? [st.id.name] : [];
    const body = setup.body.body;
    const stmts = body.map((st, i) => {
        const free = freeRefs([st], []).filter(r => !BROWSER_GLOBALS.has(r.name));
        return { i, st, names: names(st), start: st.start, end: st.end, line: st.loc.start.line, free };
    });
    return { code, ast, setup, stmts, imported, offset };
};
