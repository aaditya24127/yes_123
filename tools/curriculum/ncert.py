"""CBSE chapter lists, read from the official NCERT textbooks.

Each NCERT book has a "prelims" PDF (https://ncert.nic.in/textbook/pdf/<code>ps.pdf) with the printed table of contents.
This script downloads those PDFs, takes the text of the Contents page(s) and asks Claude (Haiku) ONLY to split that text into chapter titles.
Every title the AI returns is checked against the page text (all its words must appear there, in order), so nothing can be invented.
The book list below was taken from https://ncert.nic.in/textbook.php (English-medium books, the newest series for every class).

    python tools/curriculum/ncert.py          writes tools/curriculum/out/ncert.json
Needs ANTHROPIC_API_KEY in .env (a few cents of credit).
"""
import json, os, re, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from concurrent.futures import ThreadPoolExecutor

import pymupdf
from dotenv import dotenv_values

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); CACHE = os.path.join(OUT, 'cache'); os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

# (class, subject in the app, NCERT book code, book title)
BOOKS = [
    (1, 'English', 'aemr1', 'Mridang'), (2, 'English', 'bemr1', 'Mridang'), (3, 'English', 'cesa1', 'Santoor'), (4, 'English', 'desa1', 'Santoor'), (5, 'English', 'eesa1', 'Santoor'),
    (6, 'English', 'fepr1', 'Poorvi'), (7, 'English', 'gepr1', 'Poorvi'), (8, 'English', 'hepr1', 'Poorvi'), (9, 'English', 'iebe1', 'Kaveri'),
    (10, 'English', 'jeff1', 'First Flight'), (10, 'English', 'jefp1', 'Footprints Without Feet (supplementary reader)'),
    (1, 'Hindi', 'ahsr1', 'Sarangi'), (2, 'Hindi', 'bhsr1', 'Sarangi'), (3, 'Hindi', 'chve1', 'Veena'), (4, 'Hindi', 'dhve1', 'Veena'), (5, 'Hindi', 'ehve1', 'Veena'),
    (6, 'Hindi', 'fhml1', 'Malhar'), (7, 'Hindi', 'ghml1', 'Malhar'), (8, 'Hindi', 'hhml1', 'Malhar'), (9, 'Hindi', 'ihga1', 'Ganga'),
    (10, 'Hindi', 'jhks1', 'Kshitij Part 2'), (10, 'Hindi', 'jhsp1', 'Sparsh'), (10, 'Hindi', 'jhkr1', 'Kritika'), (10, 'Hindi', 'jhsy1', 'Sanchayan Part 2'),
    (1, 'Mathematics', 'aejm1', 'Joyful Mathematics'), (2, 'Mathematics', 'bejm1', 'Joyful Mathematics'), (3, 'Mathematics', 'cemm1', 'Maths Mela'),
    (4, 'Mathematics', 'demm1', 'Maths Mela'), (5, 'Mathematics', 'eemm1', 'Maths Mela'), (6, 'Mathematics', 'fegp1', 'Ganita Prakash'),
    (7, 'Mathematics', 'gegp1', 'Ganita Prakash Part 1'), (7, 'Mathematics', 'gegp2', 'Ganita Prakash Part 2'),
    (8, 'Mathematics', 'hegp1', 'Ganita Prakash Part 1'), (8, 'Mathematics', 'hegp2', 'Ganita Prakash Part 2'),
    (9, 'Mathematics', 'iemh1', 'Ganita Manjari Part 1'), (9, 'Mathematics', 'iemh2', 'Ganita Manjari Part 2'), (10, 'Mathematics', 'jemh1', 'Mathematics'),
    (3, 'EVS', 'ceev1', 'Our Wondrous World'), (4, 'EVS', 'deev1', 'Our Wondrous World'), (5, 'EVS', 'eeev1', 'Our Wondrous World'),
    (6, 'Science', 'fecu1', 'Curiosity'), (7, 'Science', 'gecu1', 'Curiosity'), (8, 'Science', 'hecu1', 'Curiosity'), (9, 'Science', 'iesc1', 'Exploration'), (10, 'Science', 'jesc1', 'Science'),
    (6, 'Social Science', 'fees1', 'Exploring Society: India and Beyond'), (7, 'Social Science', 'gees1', 'Exploring Society: India and Beyond Part 1'),
    (7, 'Social Science', 'gees2', 'Exploring Society: India and Beyond Part 2'), (8, 'Social Science', 'hees1', 'Exploring Society: India and Beyond Part 1'),
    (8, 'Social Science', 'hees2', 'Exploring Society: India and Beyond Part 2'), (9, 'Social Science', 'iest1', 'Understanding Society: India and Beyond Part 1'),
    (9, 'Social Science', 'iest2', 'Understanding Society: India and Beyond Part 2'), (10, 'Social Science', 'jess1', 'Contemporary India II (Geography)'),
    (10, 'Social Science', 'jess2', 'Understanding Economic Development (Economics)'), (10, 'Social Science', 'jess3', 'India and the Contemporary World II (History)'),
    (10, 'Social Science', 'jess4', 'Democratic Politics II (Civics)'),
    (6, 'Marathi', 'fmargod1', 'Marathi (third language)'),
]


def fetch(code):
    path = os.path.join(CACHE, f'{code}ps.pdf')
    if not os.path.exists(path) or os.path.getsize(path) < 10000:
        req = urllib.request.Request(f'https://ncert.nic.in/textbook/pdf/{code}ps.pdf', headers={'User-Agent': UA})
        for attempt in range(4):
            try: open(path, 'wb').write(urllib.request.urlopen(req, timeout=120).read()); break
            except Exception:
                if attempt == 3: raise
                time.sleep(3)
    return path


HEADING = r'(c\s*o\s*n\s*t\s*e\s*n\s*t\s*s|अनुक्रम|अनुक्रमणिका|विषय[\s-]*सूची|सूची|ਵਿਸ਼ਾ|فہرست)'


def contents_text(path):
    d = pymupdf.open(path)
    pages = [d[i].get_text() for i in range(len(d))]
    first = lambda t: (t.strip().split(chr(10)) or [''])[0]
    start = next((i for i, t in enumerate(pages) if re.fullmatch(r'\s*' + HEADING + r'\s*', first(t), re.I)), None)
    if start is None: start = next((i for i, t in enumerate(pages) if re.search(r'^\s*' + HEADING + r'\s*$', t, re.I | re.M)), None)
    if start is None: return ''
    out = [pages[start]]
    for t in pages[start + 1:start + 4]:                          # the list can go on to the next pages
        if re.match(r'\s*(foreword|preface|acknowledg|textbook development|about|प्रस्तावना|भूमिका|आभार)', t, re.I): break
        if re.search(r'reprint|पुनर्मुद्रण|^\s*[\d०-९]+\.?\s*$', t, re.M) and len(t) > 120: out.append(t)
        else: break
    return chr(10).join(out)


def words(s): return re.findall(r"[^\W_]+", s.lower())


def in_order(title, text_words):
    """True when every word of `title` appears in the contents text, in the same order."""
    it = iter(text_words)
    return all(w in it for w in words(title))


def ask(client, subject, book, text):
    msg = client.messages.create(model='claude-haiku-5-5', max_tokens=3000, system=(
        'You split the printed table of contents of an NCERT textbook into its chapter (lesson) titles. Use ONLY words that are in the text. '
        'Keep the order. Chapters are the numbered main entries ("Chapter 3 ...", "3. Title", or lessons under "Unit" headings). Do NOT list sub-sections such as 1.1, 1.2, '
        'summaries, "Foreword", "About the Book", "Preface", "Rationalisation", "Learning Material Sheets", answers, appendix, or page numbers. '
        'If a title is split over two lines, join it. Poems and stories count as chapters. If a numbered entry is a UNIT that has lesson titles listed under it, return those lessons (written as Unit name: Lesson name) and not the unit alone. Return JSON only: {"chapters": ["title", ...]}'),
        messages=[{'role': 'user', 'content': f'Book: {book} ({subject})\n\nContents text:\n{text[:9000]}'}])
    raw = ''.join(b.text for b in msg.content if getattr(b, 'type', '') == 'text')
    m = re.search(r'\{.*\}', raw, re.S)
    return json.loads(m.group(0))['chapters']


def one(args):
    client, (cls, subj, code, title) = args
    try:
        path = fetch(code)
        text = contents_text(path)
        if not text or re.search('[' + chr(0) + '-' + chr(8) + chr(14) + '-' + chr(31) + ']', text):          # no printed contents text (Hindi / Marathi PDFs use old fonts): read the page pictures
            import vision_toc
            chs = vision_toc.ask(client, vision_toc.page_images(path, None, 70), title, 'Hindi' if subj == 'Hindi' else 'Marathi' if subj == 'Marathi' else 'English', 'claude-sonnet-5-5')
            return dict(cls=cls, subject=subj, code=code, book=title, chapters=chs, dropped=[], read_from='page image', source=f'https://ncert.nic.in/textbook.php?{code}=0-0') if chs else dict(cls=cls, subject=subj, code=code, book=title, error='no contents found in the page pictures')
        tw = words(text)
        chs = [re.sub(r'\s+', ' ', c).strip() for c in ask(client, subj, title, text)]
        ok = [c for c in chs if in_order(c, tw)]
        return dict(cls=cls, subject=subj, code=code, book=title, chapters=ok, dropped=[c for c in chs if c not in ok], source=f'https://ncert.nic.in/textbook.php?{code}=0-0')
    except Exception as e:
        return dict(cls=cls, subject=subj, code=code, book=title, error=str(e)[:120])


def main():
    import anthropic
    key = dotenv_values(os.path.join(HERE, '..', '..', '.env')).get('ANTHROPIC_API_KEY')
    client = anthropic.Anthropic(api_key=key)
    prev = {}
    if '--retry' in sys.argv and os.path.exists(os.path.join(OUT, 'ncert.json')):
        prev = {r['code']: r for r in json.load(open(os.path.join(OUT, 'ncert.json'), encoding='utf-8')) if r.get('chapters')}
    todo = [b for b in BOOKS if b[2] not in prev]
    with ThreadPoolExecutor(6) as ex: new = list(ex.map(one, [(client, b) for b in todo]))
    res = [prev[b[2]] if b[2] in prev else next(r for r in new if r['code'] == b[2]) for b in BOOKS]
    json.dump(res, open(os.path.join(OUT, 'ncert.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for r in res: print(r['cls'], r['subject'], r['book'], '->', len(r.get('chapters', [])), 'chapters', ('DROPPED ' + str(r['dropped'])) if r.get('dropped') else '', r.get('error', ''))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
