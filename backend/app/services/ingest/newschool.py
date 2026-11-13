"""When a file is about a school that is not on the list (or names no school at all): find the school's name, the teachers named in the
file and a few facts, so the CRP can add the school with one press. Free rules only (no AI, no cost); the CRP always confirms.
"""
import difflib, re
from collections import Counter

from .sorter import STOP, _norm

SCHOOL_WORD = r'(?:School|Vidyalaya|Vidyalay|Vidyamandir|Vidya\s+Mandir|Mahavidyalaya|Shala|Academy|Convent|Junior\s+College)'
NAME_TOKEN = r"[A-Z][\w.'’&-]*"
PHRASE = re.compile(rf"((?:{NAME_TOKEN}[ \t]+){{0,5}}{SCHOOL_WORD}(?:,?[ \t]+(?!(?:Class|Std|Standard|Visit|Notes|Report|Teacher|Mrs?|Ms|Dr|The|Mathematics|Maths|English|Marathi|Hindi|Science|EVS)\b){NAME_TOKEN}){{0,3}})")
LABEL = re.compile(r"(?im)^[ \t]*(?:name[ \t]+of[ \t]+(?:the[ \t]+)?school|school[ \t]+name|school[ \t]+visited|visited[ \t]+school|school)[ \t]*[:\-–][ \t]*(.{3,90}?)[ \t]*$")
LEAD = re.compile(r"^(?:visit(?:ed)?\s+(?:(?:to|at)\s+)?|at\s+|the\s+|to\s+|from\s+|of\s+|in\s+)+", re.I)
GENERIC = STOP | {'class', 'classes', 'std', 'visit', 'notes', 'report', 'junior', 'college', 'convent', 'academy', 'mandir', 'shala', 'vidyalay', 'vidyamandir', 'mahavidyalaya', 'international'}
TITLE_NAME = re.compile(r"\b(Mr|Mrs|Ms|Miss|Dr|Smt|Shri)\.?[ \t]+([A-Z][a-z]{1,}(?:[ \t]+[A-Z][a-z]{1,}){0,2})")
NOT_NAME = {'The', 'Class', 'Teacher', 'Madam', 'Sir', 'School', 'Mathematics', 'Maths', 'English', 'Marathi', 'Hindi', 'Science', 'Evs', 'Std', 'Standard', 'Will', 'Visit', 'Notes', 'Said', 'Was', 'Has', 'Used', 'Did'}


def _clean(name: str) -> str:
    name = re.sub(r'\s+', ' ', name).strip(' ,.;:-–()[]"\'')
    name = LEAD.sub('', name).strip(' ,.;:-–')
    name = re.sub(r"\s+(?:on|dated|for|during|visit|notes?|report)\b.*$", '', name, flags=re.I).strip(' ,.;:-–')
    return name


def _good(name: str) -> bool:
    toks = [t for t in _norm(name).split() if t not in GENERIC and len(t) > 2]
    return bool(toks) and 4 <= len(name) <= 80


def find_school_name(text: str, filename: str = '') -> str | None:
    """The school the file talks about, as written in it (labelled lines count most, then the most repeated school-like phrase)."""
    body = (text or '')[:6000]
    for m in LABEL.finditer(body):
        n = _clean(m.group(1))
        if _good(n): return n
    hay = body + '\n' + filename.replace('_', ' ')
    seen = Counter(); order = []
    for m in PHRASE.finditer(hay):
        n = _clean(m.group(1))
        if not _good(n): continue
        k = _norm(n)
        if k not in seen: order.append((k, n))
        seen[k] += 1
    if not seen: return None
    best = max(order, key=lambda kn: (seen[kn[0]], -order.index(kn)))
    return best[1]


def known_name(name: str, schools) -> bool:
    """True when `name` is (almost) the name of a school we already have."""
    k = _norm(name)
    for s in schools:
        sk = _norm(s['name'])
        if not sk: continue
        if k == sk or k in sk or sk in k or difflib.SequenceMatcher(None, k, sk).ratio() >= 0.8: return True
        toks = [t for t in k.split() if t not in GENERIC and len(t) > 2]
        stoks = [t for t in sk.split() if t not in GENERIC and len(t) > 2]
        if toks and stoks and set(toks) <= set(stoks): return True
    return False


def find_teacher_names(text: str, teachers=(), limit: int = 12) -> list[str]:
    """Titled names in the file ("Mrs. Sunita Patil"), without the ones we already know."""
    known = [_norm(t['full_name']) for t in teachers]
    out, seen = [], set()
    for m in TITLE_NAME.finditer(text or ''):
        words = []
        for w in re.split(r'\s+', m.group(2)):
            if w in NOT_NAME: break
            words.append(w)
        if not words: continue
        name = f"{m.group(1)}. {' '.join(words)}"
        k = _norm(' '.join(words))
        if k in seen or any(k == x or difflib.SequenceMatcher(None, k, x).ratio() >= 0.9 for x in known): continue
        seen.add(k); out.append(name)
        if len(out) >= limit: break
    return out


def guess_profile(text: str) -> dict:
    """Type, board, medium and classes, only when the file says them (otherwise 'Not stated' and classes 1 to 10)."""
    t = text or ''
    low = t.lower()
    medium = next((w.title() for w in ('marathi', 'english', 'hindi', 'urdu', 'kannada', 'telugu', 'tamil', 'gujarati', 'bengali', 'odia', 'malayalam') if re.search(rf'\b{w}\s+medium\b', low)), None)
    board = 'CBSE' if re.search(r'\bcbse\b', low) else 'ICSE' if re.search(r'\bicse\b', low) else 'Maharashtra State Board (SSC)' if re.search(r'\bssc\b|state board', low) else None
    kind = ('Zilla Parishad' if re.search(r'\bzp\b|zilla parishad', low) else 'Municipal Corporation' if re.search(r'\bpcmc\b|municipal', low)
            else 'Government Aided Private' if re.search(r'\baided\b', low) else 'Private Unaided' if re.search(r'private unaided|\bunaided\b', low) else None)
    lo, hi = 1, 10
    m = re.search(r'classes?\s+(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})', low)
    if m and 1 <= int(m.group(1)) <= int(m.group(2)) <= 12: lo, hi = int(m.group(1)), int(m.group(2))
    return dict(school_type=kind or 'Not stated', board=board or 'Not stated', medium=medium or 'Not stated', grade_from=lo, grade_to=hi)


def detect(name, rr, section, record_date, schools, teachers):
    """What to tell the CRP about a file whose school we could not match. Returns None when nothing needs saying."""
    cand = find_school_name(rr.text, name)
    if cand and known_name(cand, schools): return None          # it is a school we know; the ordinary "please check" is enough
    if cand:
        rows = sum(max(0, len(t.get('rows', [])) - 1) for t in (rr.tables or []))
        return dict(kind='new_school', school=dict(name=cand, **guess_profile(rr.text)), teachers=find_teacher_names(rr.text, teachers),
                    data=dict(section=section, record_date=str(record_date) if record_date else None, table_rows=rows or None))
    return dict(kind='no_school')
