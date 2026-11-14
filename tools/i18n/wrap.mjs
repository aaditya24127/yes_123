// Wraps every piece of visible English text of an app in `tr('...')`, so it can be shown in the language the person chose.
//
//   node tools/i18n/wrap.mjs <app folder> [--write]       (without --write: only counts and lists what it would change)
//
// What it wraps (inside .tsx files of app/ and components/): the text between tags, text in placeholder / title / aria-label / alt / label / hint / subtitle ... attributes, and strings in
// conditions inside those places. Text with names or numbers inside ("Send to all teachers of {school}") becomes ONE phrase with placeholders, "Send to all teachers of {school}", so
// that every language can put the words in its own order. What it leaves alone: class names, links, keys, data from the server, and text outside React components (listed at the end).
// It adds `const { tr } = useLang();` to each component and the import. The phrases are written to <app>/i18n-keys.json (English -> English), which tools/i18n/translate.py translates.
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';

const appDir = path.resolve(process.argv[2] || '.'); const WRITE = process.argv.includes('--write');
const ts = createRequire(path.join(appDir, 'package.json'))('typescript');
const SKIP_DIRS = new Set(['tutorial', 'node_modules', '.next']);
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label', 'hint', 'subtitle', 'confirmLabel', 'question', 'empty', 'description', 'message']);
const ENT = { '&apos;': "'", '&quot;': '"', '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&ldquo;': '“', '&rdquo;': '”', '&lsquo;': '‘', '&rsquo;': '’', '&middot;': '·', '&hellip;': '…', '&mdash;': '—', '&ndash;': '–', '&times;': '×' };
const decode = (s) => s.replace(/&[a-z]+;/g, (m) => ENT[m] ?? m);
const hasLetters = (s) => /\p{L}/u.test(s);
const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...files(path.join(dir, e.name))); }
    else if (e.name.endsWith('.tsx')) out.push(path.join(dir, e.name));
  }
  return out;
}

const allKeys = new Set(); const manual = []; let wrapped = 0; let changedFiles = 0;

function processFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes('// i18n: skip')) return;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];               // {start, end, text, owner}
  const keys = [];

  const topFn = (node) => { let n = node; while (n.parent && n.parent.kind !== ts.SyntaxKind.SourceFile) n = n.parent; return n; };
  const isComponent = (top) => {
    if (ts.isFunctionDeclaration(top)) return !!top.name && /^[A-Z]/.test(top.name.text) || (top.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword));
    if (ts.isVariableStatement(top)) { const d = top.declarationList.declarations[0]; return !!d && ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && !!d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)); }
    if (ts.isExportAssignment(top)) return true;
    return false;
  };
  const owners = new Map();       // top-level node -> true when it is a component (and gets the hook)
  const add = (node, start, end, text) => { const top = topFn(node); edits.push({ start, end, text, top }); };

  const simple = (e) => {
    if (!e) return false;
    if (ts.isParenthesizedExpression(e)) return simple(e.expression);
    if (ts.isIdentifier(e) || ts.isNumericLiteral(e) || e.kind === ts.SyntaxKind.ThisKeyword) return true;
    if (ts.isPropertyAccessExpression(e)) return simple(e.expression);
    if (ts.isElementAccessExpression(e)) return simple(e.expression) && simple(e.argumentExpression);
    if (ts.isNonNullExpression(e)) return simple(e.expression);
    if (ts.isCallExpression(e)) return simple(e.expression) && e.arguments.every(simple);
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(e.operatorToken.kind)) return simple(e.left) && simple(e.right);
    return false;
  };
  const nameOf = (e, used) => {
    let base = 'x';
    const inner = ts.isParenthesizedExpression(e) ? e.expression : e;
    if (ts.isIdentifier(inner)) base = inner.text; else if (ts.isPropertyAccessExpression(inner)) base = inner.name.text; else if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) base = inner.expression.text;
    base = base.replace(/[^A-Za-z0-9_]/g, '') || 'x'; let n = base, i = 2; while (used.has(n)) n = base + i++; used.add(n); return n;
  };
  // a template literal "Class ${n}" -> tr('Class {n}', { n })
  const template = (node) => {
    const used = new Set(); let key = node.head.text; const vars = [];
    for (const sp of node.templateSpans) {
      if (!simple(sp.expression)) return null;
      const nm = nameOf(sp.expression, used); key += `{${nm}}` + sp.literal.text;
      const txt = sp.expression.getText(sf); vars.push(nm === txt ? nm : `${nm}: ${txt}`);
    }
    if (!hasLetters(key.replace(/\{\w+\}/g, ''))) return null;
    return { key, call: `tr(${q(key)}, { ${vars.join(', ')} })` };
  };
  const leaf = (node) => {          // one string-like expression
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!hasLetters(node.text) || /^[a-z0-9_.\/:#-]+$/.test(node.text)) return;           // ids, classes, paths: not words
      keys.push(node.text); add(node, node.getStart(sf), node.end, `tr(${q(node.text)})`);
    } else if (ts.isTemplateExpression(node)) {
      const t = template(node); if (t) { keys.push(t.key); add(node, node.getStart(sf), node.end, t.call); } else manual.push(`${path.relative(appDir, file)}: ${node.getText(sf).slice(0, 70)}`);
    }
  };
  const exprText = (e) => {         // strings that show: in conditions and fallbacks
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return exprText(e.expression);
    if (ts.isConditionalExpression(e)) { exprText(e.whenTrue); exprText(e.whenFalse); return; }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) exprText(e.right);
      return;
    }
    leaf(e);
  };
  const decodeJsx = (t) => decode(t.replace(/\s+/g, ' '));

  const children = (el) => {
    const kids = el.children;
    const meaningful = kids.filter((k) => !(ts.isJsxText(k) && !k.text.trim()));
    const texts = kids.filter((k) => ts.isJsxText(k) && hasLetters(decode(k.text)));
    if (!texts.length) { for (const k of kids) if (ts.isJsxExpression(k)) exprText(k.expression); return; }
    const mixed = meaningful.every((k) => ts.isJsxText(k) || (ts.isJsxExpression(k) && k.expression && simple(k.expression)));
    if (mixed && meaningful.some((k) => ts.isJsxExpression(k))) {               // text with names or numbers inside: one phrase
      const used = new Set(); let key = ''; const vars = [];
      for (const k of kids) {
        if (ts.isJsxText(k)) key += decodeJsx(k.text);
        else if (k.expression) { const nm = nameOf(k.expression, used); key += `{${nm}}`; const txt = k.expression.getText(sf); vars.push(nm === txt ? nm : `${nm}: ${txt}`); }
      }
      const lead = /^\s/.test(key) && !/^\s*\n/.test(kids[0].getText(sf)) ? ' ' : ''; key = key.trim();
      const start = kids[0].getStart(sf, true), end = kids[kids.length - 1].end;
      keys.push(key); add(el, kids[0].pos, end, `${lead ? "{' '}" : ''}{tr(${q(key)}, { ${vars.join(', ')} })}`);
      return;
    }
    for (const k of kids) {
      if (ts.isJsxText(k)) {
        const raw = k.text; const t = decodeJsx(raw).trim();
        if (!hasLetters(t)) continue;
        const lead = /^[ \t]/.test(raw) ? "{' '}" : ''; const trail = /[ \t]$/.test(raw) ? "{' '}" : '';
        keys.push(t); add(k, k.pos, k.end, `${lead}{tr(${q(t)})}${trail}`);
      } else if (ts.isJsxExpression(k)) exprText(k.expression);
    }
  };
  const attr = (a) => {
    const name = a.name.getText(sf); if (!ATTRS.has(name) || !a.initializer) return;
    if (ts.isStringLiteral(a.initializer)) {
      if (!hasLetters(a.initializer.text)) return;
      keys.push(decode(a.initializer.text)); add(a, a.initializer.getStart(sf), a.initializer.end, `{tr(${q(decode(a.initializer.text))})}`);
    } else if (ts.isJsxExpression(a.initializer)) exprText(a.initializer.expression);
  };
  const walk = (node) => {
    if ((ts.isJsxElement(node) || ts.isJsxFragment(node))) children(node);
    if (ts.isJsxAttribute(node)) attr(node);
    ts.forEachChild(node, walk);
  };
  walk(sf);

  // drop the edits outside components (no hook there) and report them
  const ok = []; const hooks = new Set();
  for (const e of edits) {
    if (isComponent(e.top)) { ok.push(e); hooks.add(e.top); } else manual.push(`${path.relative(appDir, file)}: text outside a component: ${src.slice(e.start, e.end).slice(0, 60).replace(/\n/g, ' ')}`);
  }
  if (!ok.length) return;
  // the hook at the start of each component, and the import
  const finalEdits = [...ok];
  for (const top of hooks) {
    let fn = top;
    if (ts.isVariableStatement(top)) fn = top.declarationList.declarations[0].initializer;
    if (ts.isExportAssignment(top)) fn = top.expression;
    const body = fn.body; if (!body || !ts.isBlock(body)) { manual.push(`${path.relative(appDir, file)}: component without a body block`); continue; }
    const text = body.getText(sf);
    // an existing  const { ... } = useLang();  gets `tr` added
    let done = false;
    for (const st of body.statements) {
      if (ts.isVariableStatement(st)) {
        const d = st.declarationList.declarations[0];
        if (d.initializer && ts.isCallExpression(d.initializer) && d.initializer.expression.getText(sf) === 'useLang' && ts.isObjectBindingPattern(d.name)) {
          if (!d.name.elements.some((x) => x.name.getText(sf) === 'tr')) finalEdits.push({ start: d.name.end - 1, end: d.name.end - 1, text: d.name.elements.length ? ', tr ' : ' tr ', top });
          done = true; break;
        }
      }
    }
    if (!done) finalEdits.push({ start: body.getStart(sf) + 1, end: body.getStart(sf) + 1, text: '\n  const { tr } = useLang();', top });
  }
  // import { useLang } from '@/lib/i18n'
  const imp = sf.statements.find((s) => ts.isImportDeclaration(s) && s.moduleSpecifier.getText(sf).slice(1, -1) === '@/lib/i18n');
  if (imp && imp.importClause?.namedBindings && ts.isNamedImports(imp.importClause.namedBindings)) {
    const nb = imp.importClause.namedBindings;
    if (!nb.elements.some((x) => x.name.text === 'useLang')) finalEdits.push({ start: nb.end - 1, end: nb.end - 1, text: nb.elements.length ? ', useLang ' : ' useLang ', top: null });
  } else {
    const imports = sf.statements.filter((s) => ts.isImportDeclaration(s)); const last = imports[imports.length - 1];
    const pos = last ? last.end : (src.startsWith("'use client'") || src.startsWith('"use client"') ? src.indexOf('\n') + 1 : 0);
    finalEdits.push({ start: pos, end: pos, text: (last || pos ? '\n' : '') + "import { useLang } from '@/lib/i18n';", top: null });
  }
  // apply from the end
  finalEdits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = src;
  for (const e of finalEdits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  wrapped += ok.length; changedFiles++;
  for (const k of keys) allKeys.add(k);
  if (WRITE) fs.writeFileSync(file, out, 'utf8');
}

for (const sub of ['app', 'components']) { const d = path.join(appDir, sub); if (fs.existsSync(d)) for (const f of files(d)) processFile(f); }
const sorted = [...allKeys].sort();
if (WRITE) fs.writeFileSync(path.join(appDir, 'i18n-keys.json'), JSON.stringify(Object.fromEntries(sorted.map((k) => [k, k])), null, 1), 'utf8');
console.log(`${WRITE ? 'Changed' : 'Would change'} ${changedFiles} files, ${wrapped} texts, ${sorted.length} different phrases.`);
console.log(`Left for hand work (${manual.length}):`); for (const m of manual.slice(0, 60)) console.log('  ' + m);
