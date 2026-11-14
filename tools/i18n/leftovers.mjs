// Lists English-looking text that is NOT wrapped in tr(): texts kept in variables, constants and messages that the wrapper cannot see. Used to finish the job by hand.
//   node tools/i18n/leftovers.mjs <app folder>
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const appDir = path.resolve(process.argv[2] || '.');
const ts = createRequire(path.join(appDir, 'package.json'))('typescript');
const SKIP = new Set(['tutorial', 'node_modules', '.next']);
const SKIP_ATTR = new Set(['className', 'href', 'src', 'type', 'key', 'id', 'name', 'value', 'htmlFor', 'dir', 'lang', 'style', 'target', 'rel', 'autoComplete', 'inputMode', 'data-tour', 'tour', 'accept', 'role', 'tone', 'variant', 'mode', 'method', 'action']);
const words = (s) => /\p{L}{2,}[\s'’-]+\p{L}{2,}/u.test(s);
function files(dir) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) { if (!SKIP.has(e.name)) out.push(...files(path.join(dir, e.name))); } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(path.join(dir, e.name)); } return out; }
let n = 0;
for (const sub of ['app', 'components', 'lib']) {
  const d = path.join(appDir, sub); if (!fs.existsSync(d)) continue;
  for (const f of files(d)) {
    if (/[\\/]lang[\\/]/.test(f) || /tutorial/.test(f) || /[\\/]lib[\\/](api|types|types-v2|theme|platform|hooks|auth)\.ts$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8'); const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const walk = (node) => {
      if (ts.isImportDeclaration(node) || ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isCallExpression(node) && ['tr', 't', 'tx', 'fill', 'require', 'fetch'].includes(node.expression.getText(sf))) return;
      if (ts.isJsxAttribute(node) && SKIP_ATTR.has(node.name.getText(sf))) return;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        const text = ts.isTemplateExpression(node) ? node.head.text + node.templateSpans.map((s) => '{}' + s.literal.text).join('') : node.text;
        if (words(text) && !/^(https?:|\/|[a-z0-9_.:#\/ -]+$)/.test(text) && !/^\s*(rounded|flex|grid|text-|bg-|px-|py-|mt-|mb-|ring|shadow|border|w-|h-)/.test(text) && !/(^| )(rounded|flex|grid|px-|py-|ring-|shadow-|border-|bg-|text-)\S/.test(text)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf)); n++;
          console.log(`${path.relative(appDir, f)}:${line + 1}  ${text.replace(/\s+/g, ' ').slice(0, 110)}`);
        }
        if (ts.isTemplateExpression(node)) node.templateSpans.forEach((s) => walk(s.expression));
        return;
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
}
console.log(`\n${n} English-looking texts are not wrapped.`);
