"""Merge the three chapter sources into one file the app reads: backend/app/knowledge/curriculum.json.

    python tools/curriculum/build.py            (needs out/ncert.json, out/shaalaa.json and, if present, out/balbharati.json)

Every book keeps where its list came from (`source`) and how it was read (`read_from`), so nothing in the dropdown is invented:
  * CBSE       : the official NCERT textbooks (contents pages of the books on ncert.nic.in)
  * MSBSHSE    : Maharashtra State Board (Balbharati). Classes 5-10 from Shaalaa.com's chapter pages; classes 1-4 from the official e-Balbharati PDFs (contents pages read as pictures)
  * ICSE       : classes 6-10 from Shaalaa.com's chapter pages for the books the council's schools use (CISCE prescribes no books for lower classes)
"""
import json, os, re, sys, collections, datetime

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
DEST = os.path.join(HERE, '..', '..', 'backend', 'app', 'knowledge', 'curriculum.json')


MEDIUM_ID = {'01': 'Marathi', '02': 'Hindi', '03': 'English', '04': 'Urdu'}      # the medium digits inside an e-Balbharati address (seen on the covers)


def load(name):
    p = os.path.join(OUT, name)
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []


def medium_of(lang):
    l = (lang or '').lower()
    for k in ('marathi', 'english', 'hindi', 'urdu', 'gujarati', 'kannada', 'telugu', 'tamil', 'bengali', 'sindhi', 'odia', 'malayalam'):
        if k in l: return k.capitalize()
    return (lang or 'any').strip().capitalize() or 'any'


def clean(chs):
    seen, out = set(), []
    for c in chs or []:
        c = re.sub(r'\s+', ' ', str(c)).strip(' .:-')
        if len(c) < 2 or c.lower() in seen: continue
        seen.add(c.lower()); out.append(c)
    return out


def build():
    books = []
    for n in load('ncert.json'):
        ch = clean(n.get('chapters'))
        if ch: books.append(dict(board='CBSE', cls=int(n['cls']), subject=n['subject'], medium='any', book=n['book'], edition='current', chapters=ch, source=n.get('source'), read_from='NCERT contents page'))
    for s in load('shaalaa.json'):
        ch = clean(s.get('chapters'))
        if not ch: continue
        icse = s.get('series') == 'icse'
        books.append(dict(board='ICSE' if icse else 'MSBSHSE', cls=int(s['cls']), subject=s['subject'], medium=s.get('medium') or 'any', book=s.get('label') or s['slug'],
                          edition='current' if s.get('series') in ('integrated', 'icse') else 'older', chapters=ch, source=s.get('source'), read_from='Shaalaa.com chapter list',
                          gaps=s.get('gaps') or None))
    for b in load('balbharati.json'):
        ch = clean(b.get('chapters'))
        subj = b.get('subject')
        if not ch or subj not in ('Marathi', 'English', 'Hindi', 'Mathematics', 'EVS', 'Science', 'Social Science'): continue
        books.append(dict(board='MSBSHSE', cls=int(b['id'][0]), subject=subj, medium=MEDIUM_ID.get(b['id'][1:3]) or medium_of(b.get('language')), book=(b.get('title') or subj).strip(), edition='current', chapters=ch,
                          source=f"https://books.ebalbharati.in/pdfs/{b['id']}.pdf", read_from='e-Balbharati PDF (contents read from page images)', year=b.get('year') or None))
    # one entry per (board, class, subject, medium, book title): keep the one with more chapters
    best = {}
    for b in books:
        k = (b['board'], b['cls'], b['subject'], b['medium'], b['book'].lower())
        if k not in best or len(b['chapters']) > len(best[k]['chapters']): best[k] = b
    books = sorted(best.values(), key=lambda b: (b['board'], b['cls'], b['subject'], b['medium'], 0 if b['edition'] == 'current' else 1, b['book']))
    data = dict(generated=str(datetime.date.today()), count=len(books), chapters=sum(len(b['chapters']) for b in books), books=books)
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    json.dump(data, open(DEST, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return data


def matrix(data):
    subs = ['English', 'Hindi', 'Marathi', 'Mathematics', 'EVS', 'Science', 'Social Science']
    have = collections.defaultdict(set)
    for b in data['books']: have[(b['board'], b['cls'], b['subject'])].add(b['medium'])
    for board in ('CBSE', 'MSBSHSE', 'ICSE'):
        print(f'\n{board}: cell = number of books (medium letters)  .  = nothing')
        print('class ' + ' '.join(f'{s[:6]:>8}' for s in subs))
        for c in range(1, 11):
            row = []
            for s in subs:
                bs = [b for b in data['books'] if b['board'] == board and b['cls'] == c and b['subject'] == s]
                m = ''.join(sorted({x['medium'][0] for x in bs}))
                row.append(f'{len(bs)}{m}'.rjust(8) if bs else '.'.rjust(8))
            print(f'{c:>5} ' + ' '.join(row))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    d = build(); print(d['count'], 'books,', d['chapters'], 'chapters ->', os.path.normpath(DEST), round(os.path.getsize(DEST) / 1024), 'KB')
    matrix(d)
