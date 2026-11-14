"""Maharashtra State Board textbooks of classes 1-8 straight from the official e-Balbharati library (books.ebalbharati.in).

The library has no list we can read, but every book is a PDF at https://books.ebalbharati.in/pdfs/<std><medium 2 digits><edition 2 digits><subject 4 digits>.pdf.
Step 1 (probe): ask the server which of those addresses exist. Step 2 (read): download the newest edition of every book that exists, and let Claude read the
cover and contents pages as pictures (title, language, year and the chapter list). Lists read this way are marked read_from: "page image".

    python tools/curriculum/balbharati.py probe        (a few minutes, writes out/balbharati_probe.json)
    python tools/curriculum/balbharati.py read         (downloads the books, a few cents of AI credit, writes out/balbharati.json)
"""
import base64, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
OUT = os.path.join(HERE, 'out'); CACHE = os.path.join(OUT, 'cache'); os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
URL = 'https://books.ebalbharati.in/pdfs/{}.pdf'


def head(id_):
    try:
        x = urllib.request.urlopen(urllib.request.Request(URL.format(id_), method='HEAD', headers={'User-Agent': UA}), timeout=25)
        return id_, int(x.headers.get('Content-Length') or 0)
    except Exception:
        return id_, 0


def probe(stds=range(1, 9), mediums=range(1, 5), editions=range(1, 10), subjects=range(1, 61)):
    ids = [f'{s}{m:02d}{e:02d}{n:04d}' for s in stds for m in mediums for e in editions for n in subjects]
    print('probing', len(ids), 'addresses'); t = time.time()
    with ThreadPoolExecutor(32) as ex: res = list(ex.map(head, ids))
    found = [dict(id=i, bytes=b) for i, b in res if b]
    json.dump(found, open(os.path.join(OUT, 'balbharati_probe.json'), 'w'), indent=0)
    print('found', len(found), 'books in', round(time.time() - t), 's')


def newest(found):
    """For every (std, medium, subject) keep the highest edition number."""
    best = {}
    for f in found:
        i = f['id']; std, med, ed, sub = i[0], i[1:3], int(i[3:5]), i[5:]
        k = (std, med, sub)
        if k not in best or ed > int(best[k]['id'][3:5]): best[k] = f
    return sorted(best.values(), key=lambda f: f['id'])


def read_book(args):
    client, f = args[:2]; deep = len(args) > 2 and args[2]           # deep: the contents page can be later in the book (more pages, a little smaller)
    import pymupdf
    path = os.path.join(CACHE, f"bb_{f['id']}.pdf")
    try:
        if not os.path.exists(path) or os.path.getsize(path) < 10000:
            for attempt in range(3):
                try: open(path, 'wb').write(urllib.request.urlopen(urllib.request.Request(URL.format(f['id']), headers={'User-Agent': UA}), timeout=180).read()); break
                except Exception:
                    if attempt == 2: raise
                    time.sleep(3)
        doc = pymupdf.open(path)
        imgs = []
        for i in list(range(0, min(len(doc), 28 if deep else 12))):
            imgs.append((i, base64.standard_b64encode(doc[i].get_pixmap(dpi=48 if deep else 62).tobytes('jpeg', jpg_quality=65)).decode()))
        content = []
        for i, b64 in imgs:
            content += [{'type': 'text', 'text': f'Page {i}:'}, {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': b64}}]
        content.append({'type': 'text', 'text': (
            'These are the first pages of a Maharashtra State Board (Balbharati) school textbook. Read them and return JSON only: '
            '{"title": "book title as printed (for example Mathematics, Marathi Balbharati, Environmental Studies Part 1)", "standard": number, "language": "the language the book is written in", '
            '"subject": "one of: Marathi, English, Hindi, Mathematics, EVS, Science, Social Science, Other", "year": "year / edition printed on the cover or title page or null", '
            '"found_contents": true or false, "chapters": ["lesson / chapter title exactly as printed", ...]}. '
            'chapters = the main entries of the table of contents (अनुक्रमणिका / Contents / Index) in order, in the script they are printed in; not sub-topics, not page numbers; '
            'if the contents list is not on these pages return found_contents false and an empty list. Never guess a title that is not printed.')})
        msg = client.messages.create(model='claude-sonnet-5-5', max_tokens=3500, messages=[{'role': 'user', 'content': content}])
        raw = ''.join(b.text for b in msg.content if getattr(b, 'type', '') == 'text')
        j = json.loads(re.search(r'\{.*\}', raw, re.S).group(0))
        j['chapters'] = [re.sub(r'\s+', ' ', c).strip() for c in j.get('chapters', []) if isinstance(c, str) and c.strip()]
        return dict(f, **j, pages=len(doc))
    except Exception as e:
        return dict(f, error=str(e)[:150])


def read():
    import anthropic
    from dotenv import dotenv_values
    client = anthropic.Anthropic(api_key=dotenv_values(os.path.join(HERE, '..', '..', '.env')).get('ANTHROPIC_API_KEY'))
    found = json.load(open(os.path.join(OUT, 'balbharati_probe.json')))
    def arg(name): return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None
    books = [b for b in newest(found) if (arg('--std') is None or b['id'][0] in arg('--std')) and (arg('--medium') is None or b['id'][1:3] in arg('--medium').split(','))]
    print('reading', len(books), 'books')
    out_path = os.path.join(OUT, 'balbharati.json')
    done = {r['id']: r for r in json.load(open(out_path, encoding='utf-8'))} if os.path.exists(out_path) and '--again' not in sys.argv else {}
    deep = '--deep' in sys.argv
    todo = [b for b in books if b['id'] not in done or done[b['id']].get('error') or (deep and not done[b['id']].get('chapters'))]
    with ThreadPoolExecutor(4) as ex:
        for r in ex.map(read_book, [(client, b, deep) for b in todo]):
            done[r['id']] = r; print(r['id'], r.get('standard'), r.get('subject'), r.get('title'), r.get('language'), r.get('year'), len(r.get('chapters', [])), r.get('error', ''))
            json.dump(list(done.values()), open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    {'probe': probe, 'read': read}[sys.argv[1] if len(sys.argv) > 1 else 'probe']()
