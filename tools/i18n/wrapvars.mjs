// Second pass after wrap.mjs. Uses the type checker of the app to find strings the first pass could not see:
//   1. any STRING shown between tags ({label}, {STEP_NAMES[i]}, {x.title}) or in a label / placeholder / title attribute becomes {tr(label)}. A text without a translation is shown as it is,
//      so names and other data from the records stay untouched; only phrases that exist in the dictionary change.
//   2. inside components: capitalised sentences in strings and templates ("Saved. The list updates the next time it loads.", `Sent to ${n} teachers.`) become tr(...) too.
//   3. strings in constants outside components are only collected (they are translated where they are shown, by 1).
//   node tools/i18n/wrapvars.mjs <app folder> [--write]       the phrases are added to <app>/i18n-keys.json
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';

const appDir = path.resolve(process.argv[2] || '.'); const WRITE = process.argv.includes('--write');
const ts = createRequire(path.join(appDir, 'package.json'))('typescript');
const SKIP_DIRS = new Set(['tutorial', 'node_modules', '.next']);
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'hint', 'subtitle', 'confirmLabel', 'question', 'empty', 'description', 'message']);
const SKIP_ATTR = new Set(['className', 'href', 'src', 'type', 'key', 'id', 'name', 'value', 'htmlFor', 'dir', 'lang', 'style', 'target', 'rel', 'autoComplete', 'inputMode', 'data-tour', 'tour', 'accept', 'role', 'tone', 'variant', 'mode', 'method', 'action', 'defaultValue']);
const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const sentence = (s) => /^[A-Z“"(][^\n]*\s[^\n]*$/.test(s) && /\p{L}{2,}/u.test(s) && !/^[A-Z][A-Za-z0-9]*$/.test(s) && !/^[\w\-./:#\s]*[=_][\w\-./:#\s=]*$/.test(s);

const cfgPath = ts.findConfigFile(appDir, ts.sys.fileExists, 'tsconfig.json');
const cfg = ts.getParsedCommandLineOfConfigFile(cfgPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
const program = ts.createProgram(cfg.fileNames, cfg.options); const checker = program.getTypeChecker();
const isStr = (e) => { const t = checker.getTypeAtLocation(e); const f = ts.TypeFlags.StringLike; return !!(t.flags & f) || (t.isUnion() && t.types.length > 0 && t.types.every((x) => x.flags & (f | ts.TypeFlags.Undefined | ts.TypeFlags.Null))); };

const keys = new Set(); const manual = []; let total = 0; let files = 0;
const inScope = (f) => { const rel = path.relative(appDir, f).replace(/\\/g, '/'); return /^(app|components)\//.test(rel) && f.endsWith('.tsx') && !rel.split('/').some((p) => SKIP_DIRS.has(p)); };

for (const sf of program.getSourceFiles()) {
  const file = sf.fileName.replace(/\//g, path.sep); if (!inScope(path.resolve(file))) continue;
  const src = sf.text; const edits = [];
  const topFn = (node) => { let n = node; while (n.parent && n.parent.kind !== ts.SyntaxKind.SourceFile) n = n.parent; return n; };
  const isComponent = (top) => {
    if (ts.isFunctionDeclaration(top)) return (!!top.name && /^[A-Z]/.test(top.name.text)) || !!top.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isVariableStatement(top)) { const d = top.declarationList.declarations[0]; return !!d && ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && !!d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)); }
    return ts.isExportAssignment(top);
  };
  const add = (node, start, end, text) => edits.push({ start, end, text, top: topFn(node) });
  const isTrCall = (n) => n.parent && ts.isCallExpression(n.parent) && ['tr', 't', 'tx', 'fill', 'require'].includes(n.parent.expression.getText(sf));
  const underSkippedAttr = (n) => { for (let p = n.parent; p; p = p.parent) { if (ts.isJsxAttribute(p)) return SKIP_ATTR.has(p.name.getText(sf)); if (ts.isArrowFunction(p) || ts.isFunctionDeclaration(p)) return false; } return false; };
  const simple = (e) => ts.isIdentifier(e) || ts.isNumericLiteral(e) || (ts.isPropertyAccessExpression(e) && simple(e.expression)) || (ts.isElementAccessExpression(e) && simple(e.expression) && simple(e.argumentExpression)) || (ts.isCallExpression(e) && simple(e.expression) && e.arguments.every(simple)) || (ts.isParenthesizedExpression(e) && simple(e.expression)) || (ts.isNonNullExpression(e) && simple(e.expression));
  const nameOf = (e, used) => { let b = 'x'; if (ts.isIdentifier(e)) b = e.text; else if (ts.isPropertyAccessExpression(e)) b = e.name.text; else if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) b = e.expression.text; b = b.replace(/[^A-Za-z0-9_]/g, '') || 'x'; let n = b, i = 2; while (used.has(n)) n = b + i++; used.add(n); return n; };

  const wrapped = new Set();
  const lit = (node) => {            // a string literal or template inside a component
    if (wrapped.has(node) || isTrCall(node) || underSkippedAttr(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!sentence(node.text)) return;
      if (ts.isJsxAttribute(node.parent)) return;                       // handled by the first pass
      keys.add(node.text); add(node, node.getStart(sf), node.end, `tr(${q(node.text)})`); wrapped.add(node);
    } else if (ts.isTemplateExpression(node)) {
      const used = new Set(); let key = node.head.text; const vars = []; let ok = true;
      for (const sp of node.templateSpans) { if (!simple(sp.expression)) { ok = false; break; } const nm = nameOf(sp.expression, used); key += `{${nm}}` + sp.literal.text; const txt = sp.expression.getText(sf); vars.push(nm === txt ? nm : `${nm}: ${txt}`); }
      if (!ok || !sentence(key.replace(/\{\w+\}/g, 'x').trim() ? key.trim() : '')) { if (ok === false && /\p{L}{3,}\s/u.test(node.head.text + node.templateSpans.map((s) => s.literal.text).join(''))) manual.push(`${path.relative(appDir, file)}: ${node.getText(sf).slice(0, 80)}`); return; }
      keys.add(key); add(node, node.getStart(sf), node.end, `tr(${q(key)}, { ${vars.join(', ')} })`); wrapped.add(node);
    }
  };
  const walk = (node) => {
    if (ts.isImportDeclaration(node) || ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
    // 1. a string shown between tags
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const e = node.expression;
      if ((ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && isStr(e) && !/^(children|key)$/.test(e.getText(sf))) {
        add(node, e.getStart(sf), e.end, `tr(${e.getText(sf)})`);
      }
    }
    // ... or in a label-like attribute
    if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(sf)) && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      const e = node.initializer.expression;
      if ((ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) && isStr(e)) add(node, e.getStart(sf), e.end, `tr(${e.getText(sf)})`);
    }
    // 2. sentences in strings and templates inside components
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
      const top = topFn(node);
      if (isComponent(top)) lit(node); else if (!ts.isJsxAttribute(node.parent) && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && sentence(node.text)) keys.add(node.text);   // 3. constants: only collected
      if (ts.isTemplateExpression(node)) node.templateSpans.forEach((s) => walk(s.expression));
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  const ok = []; const hooks = new Set();
  for (const e of edits) { if (isComponent(e.top)) { ok.push(e); hooks.add(e.top); } else manual.push(`${path.relative(appDir, file)}: outside a component: ${src.slice(e.start, e.end).slice(0, 50)}`); }
  if (!ok.length) continue;
  // the same string may be reached twice: keep one edit per range
  const seen = new Set(); const uniq = ok.filter((e) => { const k = e.start + ':' + e.end; if (seen.has(k)) return false; seen.add(k); return true; });
  const final = [...uniq];
  for (const top of hooks) {
    let fn = top; if (ts.isVariableStatement(top)) fn = top.declarationList.declarations[0].initializer; if (ts.isExportAssignment(top)) fn = top.expression;
    const body = fn.body; if (!body || !ts.isBlock(body)) continue;
    let done = false;
    for (const st of body.statements) {
      if (ts.isVariableStatement(st)) {
        const d = st.declarationList.declarations[0];
        if (d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText(sf) === 'useLang' && ts.isObjectBindingPattern(d.name)) {
          if (!d.name.elements.some((x) => x.name.getText(sf) === 'tr')) final.push({ start: d.name.end - 1, end: d.name.end - 1, text: d.name.elements.length ? ', tr ' : ' tr ' });
          done = true; break;
        }
      }
    }
    if (!done) final.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: '\n  const { tr } = useLang();' });
  }
  const imp = sf.statements.find((s) => ts.isImportDeclaration(s) && s.moduleSpecifier.getText(sf).slice(1, -1) === '@/lib/i18n');
  if (imp && imp.importClause?.namedBindings && ts.isNamedImports(imp.importClause.namedBindings)) {
    const nb = imp.importClause.namedBindings; if (!nb.elements.some((x) => x.name.text === 'useLang')) final.push({ start: nb.end - 1, end: nb.end - 1, text: nb.elements.length ? ', useLang ' : ' useLang ' });
  } else if (!imp) {
    const imports = sf.statements.filter((s) => ts.isImportDeclaration(s)); const last = imports[imports.length - 1];
    const pos = last ? last.end : 0; final.push({ start: pos, end: pos, text: "\nimport { useLang } from '@/lib/i18n';" });
  }
  final.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src; for (const e of final) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  total += uniq.length; files++;
  if (WRITE) fs.writeFileSync(file, out, 'utf8');
}
const keyFile = path.join(appDir, 'i18n-keys.json');
const have = fs.existsSync(keyFile) ? Object.keys(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) : [];
const all = [...new Set([...have, ...keys])].sort();
if (WRITE) fs.writeFileSync(keyFile, JSON.stringify(Object.fromEntries(all.map((k) => [k, k])), null, 1), 'utf8');
console.log(`${WRITE ? 'Changed' : 'Would change'} ${files} files, ${total} more texts. ${all.length} phrases in all (${all.length - have.length} new).`);
console.log(`Left for hand work (${manual.length}):`); for (const m of manual.slice(0, 50)) console.log('  ' + m);
