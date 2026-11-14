// Builds <app>/i18n-keys.json: every English phrase the app can show.
//   1. the first argument of every tr('...') call,
//   2. English-looking labels kept in constants (maps of labels, steps, chips) that are shown later through tr(variable).
// A phrase that is collected but never shown is harmless (one more entry in the dictionaries).
//   node tools/i18n/collect.mjs <app folder>
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const appDir = path.resolve(process.argv[2] || '.');
const ts = createRequire(path.join(appDir, 'package.json'))('typescript');
const SKIP = new Set(['tutorial', 'node_modules', '.next', 'lang']);
const NOT_TEXT = /^(https?:|\/|[a-z0-9_.:#\/ -]+$|[A-Z0-9_]+$|[A-Za-z]+-[A-Za-z]{2}$)/;
const CSS = /(^| )(rounded|flex|grid|px-|py-|ring|shadow|border|bg-|text-|font-|hover:|sm:|md:|lg:|w-|h-|mt-|mb-|ml-|mr-|gap-)\S/;
const looksLabel = (s) => s.length >= 2 && s.length <= 160 && /^[A-Z“"(\d]/.test(s) && /\p{L}{2,}/u.test(s) && !NOT_TEXT.test(s) && !CSS.test(s) && !/[=<>{}\[\]$\\]/.test(s.replace(/\{\w+\}/g, '')) && !/^[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*$/.test(s);
function files(dir) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...files(path.join(dir, e.name))); } else if (/\.tsx?$/.test(e.name)) out.push(path.join(dir, e.name)); } return out; }
const keys = new Set();
for (const sub of ['app', 'components', 'lib']) {
  const d = path.join(appDir, sub); if (!fs.existsSync(d)) continue;
  for (const f of files(d)) {
    if (/[\\/]lib[\\/](api|types|types-v2|platform|hooks|auth|i18n)\.tsx?$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8'); const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const walk = (node) => {
      if (ts.isImportDeclaration(node) || ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isCallExpression(node) && node.expression.getText(sf) === 'tr' && node.arguments[0] && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) { keys.add(node.arguments[0].text); return ts.forEachChild(node, walk); }
      if (ts.isJsxAttribute(node) && /^(className|href|src|type|key|id|name|htmlFor|style|data-tour)$/.test(node.name.getText(sf))) return;
      if (ts.isCallExpression(node) && ['fetch', 'require', 'tx', 'fill', 't'].includes(node.expression.getText(sf))) return;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { if (looksLabel(node.text)) keys.add(node.text); return; }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
}
// the menu texts of lib/lang/en.ts: a language without its own translation of one falls back to the translation of the English words
const enFile = path.join(appDir, 'lib/lang/en.ts');
if (fs.existsSync(enFile)) for (const m of fs.readFileSync(enFile, 'utf8').matchAll(/\w+:\s*'((?:[^'\\]|\\.)*)'/g)) { const v = m[1].replace(/\\'/g, "'"); if (/\p{L}{2,}/u.test(v) && v.length < 200) keys.add(v); }
// phrases that only exist on the server (notice titles, provider notes) or in data files: listed by hand in <app>/i18n-extra.json
const extraFile = path.join(appDir, 'i18n-extra.json');
if (fs.existsSync(extraFile)) for (const k of JSON.parse(fs.readFileSync(extraFile, 'utf8'))) keys.add(k);
const keyFile = path.join(appDir, 'i18n-keys.json');
const old = fs.existsSync(keyFile) ? Object.keys(JSON.parse(fs.readFileSync(keyFile, 'utf8'))) : [];
const all = [...new Set([...old, ...keys])].sort();
fs.writeFileSync(keyFile, JSON.stringify(Object.fromEntries(all.map((k) => [k, k])), null, 1), 'utf8');
console.log(`${all.length} phrases (${all.length - old.length} new).`);
