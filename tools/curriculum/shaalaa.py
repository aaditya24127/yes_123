"""Maharashtra State Board (Balbharati) classes 5-10 and ICSE classes 6-10: chapter lists as printed by shaalaa.com.

shaalaa.com keeps one page per textbook ("Balbharati Solutions ...", "Selina Solutions ...") with the chapter titles in the order of the book. This script reads those pages
(no AI, only the page text) and writes tools/curriculum/out/shaalaa.json. Two things to know:
  * the site lists only chapters it has solutions for, so a few chapters can be missing; `gaps` lists the missing chapter numbers when the numbering shows it;
  * CISCE (ICSE) does not prescribe textbooks for classes 1-8, so only the common books that exist for classes 6-10 are listed.

    python tools/curriculum/shaalaa.py
"""
import html, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); CACHE = os.path.join(OUT, 'cache'); os.makedirs(CACHE, exist_ok=True)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
BASE = 'https://www.shaalaa.com/textbook-solutions/'


def get(url, name):
    path = os.path.join(CACHE, name)
    if os.path.exists(path) and os.path.getsize(path) > 5000: return open(path, encoding='utf-8').read()
    for attempt in range(3):
        try:
            h = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read().decode('utf-8', 'ignore')
            if len(h) > 5000: open(path, 'w', encoding='utf-8').write(h); return h
        except Exception: time.sleep(2 + attempt * 3)
    return ''


def index_slugs():
    h = get('https://www.shaalaa.com/textbook-solutions', 'index.html')
    return sorted(set(re.findall(r'href="/textbook-solutions/([^"#?/]+_\d+)"', h)))


def subject_of(name):
    n = name
    if re.match(r'(marathi)', n): return 'Marathi'
    if re.match(r'(hindi|itihaas-aur|itihas-aur)', n) and not re.match(r'hindi-.*-ekatmik-marathi', n): return 'Hindi' if n.startswith('hindi') else 'Social Science'
    if n.startswith('hindi'): return 'Hindi'
    if re.match(r'(english|my-english)', n): return 'English'
    if re.match(r'(mathematics|algebra|geometry|ganit|bijganit|bhumiti)', n): return 'Mathematics'
    if re.match(r'(general-science|science-and-technology|vigyan|vigyaan|samanya-vigyan)', n): return 'Science'
    if re.match(r'(history|geography|bhugol|itihas|civics|political|rajyashastra)', n): return 'Social Science'
    if re.match(r'(environmental-studies|play-do-learn)', n): return 'EVS'
    return None


def balbharati_books(slugs):
    out = []
    for s in slugs:
        if not s.startswith('balbharati-solutions-') or 'maharashtra-state' not in s: continue
        sid = s.rsplit('_', 1)[1]
        name = s[len('balbharati-solutions-'):s.index('-maharashtra')]
        m = re.search(r'standard-(\d+)', name) or re.search(r'(\d+)(?:th|st|nd|rd)?-standard', name)
        if not m or not 5 <= int(m.group(1)) <= 10: continue
        std = int(m.group(1)); subj = subject_of(name)
        if not subj: continue
        medium = 'Marathi' if re.search(r'marathi-standard|ekatmik-marathi|-marathi-\d', name) and subj not in ('Marathi', 'English', 'Hindi') else 'Hindi' if re.search(r'hindi-standard|ekatmik-hindi|-hindi-\d', name) and subj not in ('Marathi', 'English', 'Hindi') else 'English'
        if subj in ('Marathi', 'Hindi', 'English'): medium = 'any'
        if medium == 'Hindi': continue
        label = re.sub(r'-?standard-\d+|-?\d+-standard|-?(english|marathi|hindi)(?=-|$)', '', name).strip('-').replace('-', ' ').title()
        out.append(dict(slug=s, id=sid, cls=std, subject=subj, medium=medium, label=label or subj, series='integrated' if re.search(r'integrated|ekatmik', name) else 'older'))
    return out


ICSE_SKIP = ('computer', 'commercial', 'economic', 'home-science', 'physical-education', 'environmental', 'saras', 'shakespeare', 'workbook', 'julius')


def icse_books(slugs):
    out = []
    pub = {'selina': 'Selina Concise', 'frank': 'Frank', 'morning-star': 'Morning Star Total', 'oxford-university-press': 'Oxford', 'goyal-brothers-prakashan': 'Goyal Brothers', 'viraf-j-dalal': 'Viraf J Dalal',
           'nootan': 'Nootan', 'ml-aggarwal': 'ML Aggarwal', 'rs-aggarwal': 'RS Aggarwal', 'lakhmir-singh': 'Lakhmir Singh', 'sp-singh': 'SP Singh', 'evergreen-publication': 'Evergreen',
           'b-nirmala-shastry': 'B Nirmala Shastry', 'rachna-sapra': 'Rachna Sapra', 'austine-vas-hemant-m-pednekar-vidhya-malar': 'Vidhya Malar'}
    for s in slugs:
        if '-icse_' not in s or '-isc_' in s: continue
        low = s.lower()
        m = re.search(r'class-(\d+)(?:-and-(\d+))?-icse', low)
        if not m: continue
        classes = [int(m.group(1))] + ([int(m.group(2))] if m.group(2) else [])
        if not all(6 <= c <= 10 for c in classes): continue
        if any(k in low for k in ICSE_SKIP) and 'treasure-trove' not in low: continue
        p = next((v for k, v in pub.items() if low.startswith(k + '-solutions')), None)
        if not p: continue
        if re.search(r'mathematics|maths', low): subj, book = 'Mathematics', 'Mathematics'
        elif 'physics' in low: subj, book = 'Science', 'Physics'
        elif 'chemistry' in low: subj, book = 'Science', 'Chemistry'
        elif 'biology' in low: subj, book = 'Science', 'Biology'
        elif 'history' in low: subj, book = 'Social Science', 'History and Civics'
        elif 'geography' in low: subj, book = 'Social Science', 'Geography'
        elif 'treasure-trove' in low: subj, book = 'English', 'Treasure Trove (literature)'
        else: continue
        for c in classes:
            out.append(dict(slug=s, id=s.rsplit('_', 1)[1], cls=c, subject=subj, medium='English', label=f'{book} ({p})', series='icse'))
    return out


DIGITS = {chr(0x0966 + i): str(i) for i in range(10)}        # Devanagari digits (Marathi / Hindi books number their chapters with them)


def num(t):
    return int(''.join(DIGITS.get(c, c) for c in t))


def chapters(slug):
    h = get(BASE + slug, slug + '.html')
    items, extra = [], []
    for u, t in re.findall(r'<a[^>]+href="([^"]*-chapter-[^"]*)"[^>]*>(.*?)</a>', h, re.S):
        if '#ex=' in u: continue                                    # exercises / activities of a chapter
        t = html.unescape(re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', t))).strip().lstrip('•').strip()
        m = re.match(r'^([\d०-९]+)\s*(?:\.\s*\([^)]*\))?\s*[:.]\s*(.+)$', t)
        if m and not re.match(r'(problem set|exercise|activity|intext|सरावसंच|स्वाध्याय|उपक्रम)', m.group(2), re.I): items.append((num(m.group(1)), m.group(2).strip()))
        elif re.match(r'^\*\s*[:.]\s*(.+)$', t): extra.append(re.sub(r'^\*\s*[:.]\s*', '', t))     # supplementary reading, revision pages without a number
    seen, out = set(), []
    for n, t in items:
        if t in seen: continue
        seen.add(t); out.append((n, t))
    nums = [n for n, _ in out]
    gaps = [n for n in range(1, (max(nums) if nums else 0) + 1) if n not in nums]
    return [t for _, t in out], gaps


def one(b):
    try:
        chs, gaps = chapters(b['slug']); time.sleep(0.4)
        return dict(b, chapters=chs, gaps=gaps, source=BASE + b['slug'])
    except Exception as e:
        return dict(b, chapters=[], gaps=[], error=str(e)[:100])


def main():
    slugs = index_slugs()
    wanted = balbharati_books(slugs) + icse_books(slugs)
    print('books to read:', len(wanted))
    with ThreadPoolExecutor(4) as ex: res = list(ex.map(one, wanted))
    json.dump(res, open(os.path.join(OUT, 'shaalaa.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    empty = [r['slug'] for r in res if not r['chapters']]
    print('read', len(res), 'books; without chapters:', len(empty)); [print('  empty:', e) for e in empty[:30]]


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
