"""Chapter lists per school board, class and subject (for the chapter dropdown before a visit and the teacher assessment).

The lists are in `knowledge/curriculum.json`, built by `tools/curriculum/build.py` from official sources (NCERT contents pages, the e-Balbharati PDFs, Shaalaa.com chapter pages;
every book keeps its `source` and `read_from`). Nothing here is written by the AI at run time.

When a school's own board has no list for a class and subject, the next best list is returned together with a plain note that says so (never silently).
"""
import json, os
from functools import lru_cache

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'knowledge', 'curriculum.json')
BOARD_LABEL = {'CBSE': 'CBSE (NCERT)', 'MSBSHSE': 'Maharashtra State Board (Balbharati)', 'ICSE': 'ICSE'}
# What to show when a board has nothing for a class and subject: (board, note)
FALLBACK = {
    'CBSE': [('MSBSHSE', 'No NCERT book for this subject and class. The nearest list is the Maharashtra State Board (Balbharati) book.')],
    'ICSE': [('CBSE', 'ICSE schools choose their own books for this class and subject (the council prescribes none). The NCERT chapter list is shown as a guide.'),
             ('MSBSHSE', 'ICSE schools choose their own books for this class and subject. The Maharashtra State Board list is shown as a guide.')],
    'MSBSHSE': [('CBSE', 'No Maharashtra State Board list found for this class and subject. The NCERT chapter list is shown as a guide.')],
}


@lru_cache(maxsize=1)
def _data():
    try:
        return json.load(open(PATH, encoding='utf-8'))
    except FileNotFoundError:
        return dict(generated=None, count=0, chapters=0, books=[])


def board_key(board):
    b = (board or '').lower()
    return 'CBSE' if 'cbse' in b or 'ncert' in b else 'ICSE' if 'icse' in b or 'cisce' in b else 'MSBSHSE' if ('maharashtra' in b or 'ssc' in b or 'state' in b or 'balbharati' in b) else None


def mediums(medium):
    """The media of instruction whose books a school may use, best first ("Marathi (semi-English)" uses both)."""
    m = (medium or '').lower(); out = []
    for k in ('marathi', 'english', 'hindi', 'urdu'):
        if k in m: out.append(k.capitalize())
    if 'semi' in m and 'English' not in out: out.append('English')
    return out or ['English']


def _pick(board, class_no, subject, meds):
    bs = [b for b in _data()['books'] if b['board'] == board and b['cls'] == class_no and b['subject'] == subject and (b['medium'] == 'any' or b['medium'] in meds)]
    # a book in the school's own medium first (in the order of `meds`), then books for every medium, current edition before an older one
    return sorted(bs, key=lambda b: (meds.index(b['medium']) if b['medium'] in meds else len(meds), 0 if b['edition'] == 'current' else 1, b['book']))


def _out(b):
    return dict(book=b['book'], edition=b['edition'], chapters=b['chapters'], source=b.get('source'), read_from=b.get('read_from'), medium=b['medium'], board=b['board'])


def lookup(board, medium, class_no, subject):
    """{books: [...], note: str | None, board: the board the books are from, own_board: ...}. `books` may be empty (the app then lets the person type the chapter)."""
    bk = board_key(board); meds = mediums(medium)
    try: class_no = int(class_no)
    except (TypeError, ValueError): class_no = None
    res = dict(books=[], note=None, board=bk, own_board=bk, board_label=BOARD_LABEL.get(bk), count=_data().get('count', 0))
    if not (bk and class_no and subject): return res
    books = _pick(bk, class_no, subject, meds)
    if books:
        res['books'] = [_out(b) for b in books]
        if subject == 'Marathi' and bk != 'MSBSHSE': res['note'] = None
        return res
    if class_no <= 5 and subject in ('Science', 'Social Science'):                     # up to Class 5 these are one subject, Environmental Studies
        books = _pick(bk, class_no, 'EVS', meds)
        if books:
            res.update(books=[_out(b) for b in books], note='Up to Class 5 this subject is taught as Environmental Studies (EVS). Its chapters are shown.')
            return res
    chain = list(FALLBACK.get(bk, []))
    if subject == 'Marathi' and bk != 'MSBSHSE': chain.insert(0, ('MSBSHSE', 'Marathi books are taken from the Maharashtra State Board (Balbharati), the state\'s Marathi textbooks.'))
    for board2, note in chain:
        books = _pick(board2, class_no, subject, ['Marathi', 'English'] if subject == 'Marathi' else meds)
        if books:
            res.update(books=[_out(b) for b in books], note=note, board=board2, board_label=BOARD_LABEL.get(board2))
            return res
    res['note'] = 'No chapter list was found for this class and subject. Type the chapter instead.'
    return res
