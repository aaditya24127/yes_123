"""Translates the screen texts of an app into the 10 Indian languages (a build-time tool, not part of the running app).

    backend\\.venv\\Scripts\\python.exe -W ignore tools\\i18n\\translate.py frontend            all languages, only phrases that are missing
    backend\\.venv\\Scripts\\python.exe -W ignore tools\\i18n\\translate.py frontend mr hi      only these languages
    ... --redo                                                                                  translate everything again

Input : <app>/i18n-keys.json       (made by tools/i18n/collect.mjs: every English phrase the app can show)
Output: <app>/lib/lang/ui/<code>.json   { "English phrase": "translation" }  (read by lib/i18n.tsx)
Rules : {placeholders} stay as they are, brand names and short codes stay in Latin letters, the wording matches the app's
        existing menu translations (lib/lang/<code>.ts, passed as a glossary), an answer that breaks a rule is asked again.
Needs ANTHROPIC_API_KEY (read from .env, never printed). Costs a few dollars of Claude Sonnet per full run.
"""
import json, os, re, sys, concurrent.futures as cf
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LANGS = {
    'hi': 'Hindi (Devanagari)', 'bn': 'Bengali', 'mr': 'Marathi (Devanagari)', 'te': 'Telugu', 'ta': 'Tamil',
    'gu': 'Gujarati', 'ur': 'Urdu (Nastaliq script, right to left)', 'kn': 'Kannada', 'or': 'Odia', 'ml': 'Malayalam',
}
MODEL = os.environ.get('I18N_MODEL', 'claude-sonnet-5-5')
BATCH = 45
KEEP = 'CRP, AI, PDF, WhatsApp, Mentor Copilot, Teams, MP3, OK, PIN, SMS'


def env_key():
    if os.environ.get('ANTHROPIC_API_KEY'):
        return os.environ['ANTHROPIC_API_KEY']
    for line in (ROOT / '.env').read_text(encoding='utf8').splitlines():
        if line.startswith('ANTHROPIC_API_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    sys.exit('No ANTHROPIC_API_KEY')


def ts_pairs(code):
    """English -> language pairs from the existing menu translations, as a glossary."""
    pat = re.compile(r"(\w+):\s*'((?:[^'\\]|\\.)*)'")
    en = dict(pat.findall((ROOT / 'frontend/lib/lang/en.ts').read_text(encoding='utf8')))
    tx = dict(pat.findall((ROOT / f'frontend/lib/lang/{code}.ts').read_text(encoding='utf8')))
    return [(en[k].replace("\\'", "'"), v.replace("\\'", "'")) for k, v in tx.items() if k in en and len(en[k]) < 40][:60]


def holes(s):
    return sorted(re.findall(r'\{\w+\}', s))


def ask(client, code, name, phrases, glossary):
    gl = '\n'.join(f'  {a} = {b}' for a, b in glossary)
    system = (
        f'You translate the screens of a mobile app into {name}. The app helps a Cluster Resource Person (CRP, a government school mentor in India) '
        'visit schools and coach teachers. Readers are teachers and mentors: write short, simple, polite, natural everyday words, the way a helpful colleague would say it, '
        'never word for word, never stiff or bookish. Use the common Indian school vocabulary (school, teacher, class, chapter, visit, report) '
        'as people in that language really say it; a widely used English word (for example "report", "PDF", "WhatsApp") may stay in Latin letters. '
        f'Keep these exactly as they are: {KEEP}. Keep {{placeholders}} such as {{name}} or {{n}} exactly as written (letters in braces), '
        'in a position that is natural in the target language. Keep numbers, punctuation marks like … and arrows, and emoji. '
        'Keep the meaning, length and tone of a button as a button (short), a hint as a hint. Do not add explanations.\n'
        f'Existing translations in the same app, to stay consistent with:\n{gl}\n'
        'Answer with one JSON object only: {"translations": [string, ...]} with exactly one translation per input phrase, in the same order.'
    )
    msg = client.messages.create(
        model=MODEL, max_tokens=8000, system=system,
        messages=[{'role': 'user', 'content': json.dumps(phrases, ensure_ascii=False)}],
    )
    text = ''.join(b.text for b in msg.content if getattr(b, 'type', '') == 'text')
    a, b = text.find('{'), text.rfind('}')
    out = json.loads(text[a:b + 1])['translations']
    if len(out) != len(phrases):
        raise ValueError(f'got {len(out)} for {len(phrases)}')
    return out


def good(src, dst):
    return isinstance(dst, str) and dst.strip() and holes(src) == holes(dst)


def do_batch(client, code, name, phrases, glossary):
    for attempt in range(3):
        try:
            out = ask(client, code, name, phrases, glossary)
            ok = {s: d.strip() for s, d in zip(phrases, out) if good(s, d)}
            bad = [s for s in phrases if s not in ok]
            if bad and len(phrases) > 1 and attempt < 2:      # ask again only for the broken ones
                ok.update(do_batch(client, code, name, bad, glossary))
            return ok
        except Exception as e:  # noqa: BLE001
            print(f'  [{code}] retry {attempt + 1}: {str(e)[:80]}', flush=True)
    return {}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    redo = '--redo' in sys.argv
    app = ROOT / (args[0] if args else 'frontend')
    codes = args[1:] or list(LANGS)
    import anthropic
    client = anthropic.Anthropic(api_key=env_key(), max_retries=4, timeout=180)
    keys = list(json.loads((app / 'i18n-keys.json').read_text(encoding='utf8')))
    outdir = app / 'lib/lang/ui'
    outdir.mkdir(parents=True, exist_ok=True)
    jobs = []
    have = {}
    for code in codes:
        f = outdir / f'{code}.json'
        have[code] = {} if redo or not f.exists() else json.loads(f.read_text(encoding='utf8'))
        shared = ROOT / 'frontend/lib/lang/ui' / f'{code}.json'      # the other app already translated many of the same phrases: reuse them, same wording in both apps
        if app.name != 'frontend' and shared.exists():
            for k, v in json.loads(shared.read_text(encoding='utf8')).items():
                if k in keys and k not in have[code]:
                    have[code][k] = v
        todo = [k for k in keys if k not in have[code]]
        gl = ts_pairs(code)
        for i in range(0, len(todo), BATCH):
            jobs.append((code, todo[i:i + BATCH], gl))
    print(f'{len(keys)} phrases, {len(jobs)} requests for {len(codes)} languages with {MODEL}', flush=True)
    with cf.ThreadPoolExecutor(8) as ex:
        futs = {ex.submit(do_batch, client, c, LANGS[c], ph, gl): (c, ph) for c, ph, gl in jobs}
        for n, fu in enumerate(cf.as_completed(futs), 1):
            c, ph = futs[fu]
            have[c].update(fu.result())
            print(f'  {n}/{len(futs)} {c} {len(fu.result())}/{len(ph)}', flush=True)
    for code in codes:
        d = {k: have[code][k] for k in keys if k in have[code]}
        (outdir / f'{code}.json').write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf8')
        print(f'{code}: {len(d)}/{len(keys)} translated, {len(keys) - len(d)} missing')


if __name__ == '__main__':
    main()
