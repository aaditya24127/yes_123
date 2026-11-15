"""The brain of the voice assistant (hands-free control of the website).

One spoken sentence = one `turn`:
  1. `context()` gives the AI what it needs to understand names and answer at once: the schools and teachers (with ids), the current priority ranking, the priority factors, the colours.
  2. The AI (task `voice_turn`) answers with what to SAY and which ACTIONS the website must do (open a page, fill the visit, ...). Actions are only descriptions: the browser carries them out.
  3. When the AI needs data it does not have (why a school ranks third, the evidence, the chapters of a book, a teacher's assessment) it returns a `query`; the server runs it on the real records and
     calls the AI once more with the result (`data`), so every spoken fact comes from the records, never from memory.
"""
import datetime as dt
import re
import threading
import time

from .. import ai
from .prioritization import engine
from .prioritization.data import Data, get_conn

THEMES = ['Royal blue', 'Evergreen', 'Deep teal', 'Plum', 'Crimson dusk', 'Fiery ocean', 'Burgundy sand', 'Papyrus']
PAGES = ['priorities', 'upload', 'visit', 'teachers', 'ask', 'settings']
_cache: dict = {}
_lock = threading.Lock()
TTL = 600                      # the ranking changes rarely; saving priorities clears it (forget). Rebuilding it on a hosted database takes about 10 seconds, so it is kept and warmed in advance


def _today():
    return dt.date.today()


def _item_brief(i: dict) -> dict:
    cats = sorted([c for c in (i.get('categories') or []) if (c.get('contribution') or 0) > 0], key=lambda c: -(c.get('contribution') or 0))[:3]
    return dict(rank=i.get('rank'), id=i['id'], name=i['name'], score=i.get('score'), band=i.get('band'), headline=i.get('headline'),
                main_reasons=[f"{c['label']} ({round(c['contribution'], 1)} points)" for c in cats],
                school=i.get('school_name') if i.get('entity') == 'teacher' else None, needs_evidence=bool(i.get('insufficient')))


_building = threading.Lock()


def _any():
    with _lock:
        return _cache.get('ctx')


def _context() -> dict:
    """What the AI is told about the world. A copy that is a little old is still used at once (the ranking changes rarely) and renewed in the background, so a sentence never waits
    for the ten seconds the ranking takes to build, except the very first one after the server started: that one waits for the build the warm-up has already begun."""
    hit = _any()
    if hit is not None:
        if time.time() - hit[0] >= TTL: _refresh_in_background()
        return hit[1]
    with _building:
        hit = _any()
        return hit[1] if hit is not None else _build_context()


def _refresh_in_background():
    if _building.locked(): return
    def work():
        with _building:
            _safe(_build_context)
    threading.Thread(target=work, daemon=True).start()


def _build_context() -> dict:
    with get_conn() as conn:
        schools = conn.execute('select id, code, name, board, medium, village from schools where is_active order by code').fetchall()
        teachers = conn.execute('select id, school_id, title, full_name, designation, classes_taught, subjects_taught from teachers where is_active order by teacher_code').fetchall()
        d = Data(conn)
        codes = engine.factor_codes(d)
        factors = [dict(code=c, name=d.categories[c]['name'], weight=round(float(d.weights.get(c, 0) or 0), 1)) for c in codes]
        rank = {}
        for ent in ('school', 'teacher'):
            res = engine.run(d, _today(), ent)
            rank[ent] = dict(summary=res.get('summary'), items=[_item_brief(i) for i in res['items'] if not i.get('insufficient')][:15 if ent == 'teacher' else 12],
                             unranked=[i['name'] for i in res['items'] if i.get('insufficient')][:8])
    mine: dict = {}
    for t in teachers:
        mine.setdefault(str(t['school_id']), []).append(dict(id=str(t['id']), name=f"{t['title'] or ''} {t['full_name']}".strip(), role=t['designation'], classes=t['classes_taught'], subjects=t['subjects_taught']))
    ctx = dict(
        today=str(_today()),
        schools=[dict(id=str(s['id']), code=s['code'], name=s['name'], board=s['board'], medium=s['medium'], village=s['village'], teacher_count=len(mine.get(str(s['id']), [])),
                      teachers=mine.get(str(s['id']), [])) for s in schools],
        ranking=rank, factors=[f for f in factors if f['weight'] > 0] + [dict(f, off=True) for f in factors if f['weight'] <= 0][:12], themes=THEMES, pages=PAGES)
    with _lock: _cache['ctx'] = (time.time(), ctx)
    return ctx


_primed = False


def _prime():
    """The first call to the AI and to the voice service of a freshly started server takes several seconds (libraries load, the secure connections open). It is made once, in the
    background, with a tiny question and a one-word sentence, so that the first sentence the CRP speaks is as fast as the rest."""
    global _primed
    if _primed: return
    _primed = True
    try: ai.run('voice_turn', dict(language='English', address='', utterance='hello', page='/', page_state={}, history=[], context={}))
    except Exception: pass
    try:
        import asyncio
        from . import voice_audio
        async def speak_once():
            async for _ in await voice_audio.stream_speech('Ready.', 'en', 'male', 'gb', 1.0): pass
        asyncio.run(speak_once())
    except Exception: pass


def warm():
    """Builds the context in the background (when the server starts, when voice mode is switched on, after the priorities changed), so the first sentence is not slow."""
    def work():
        _safe(_context); _prime()
    threading.Thread(target=work, daemon=True).start()


def _safe(fn):
    try: fn()
    except Exception: pass


def forget():
    """Called when priorities change, so the next sentence sees the new ranking (it is rebuilt at once, in the background)."""
    with _lock: _cache.clear()
    warm()


# ------------------------------------------------------------------ lookups the AI can ask for
def _q_ranking_explain(q):
    with get_conn() as conn:
        d = Data(conn)
        res = engine.run(d, _today(), q.get('entity') or 'school')
    for i in res['items']:
        if i['id'] == q.get('id'):
            return dict(name=i['name'], rank=i.get('rank'), of=len([x for x in res['items'] if not x.get('insufficient')]), score=i.get('score'), band=i.get('band'), headline=i.get('headline'),
                        reasons=i.get('reasons'), alerts=[a['message'] for a in (i.get('alerts') or [])], flags=[f['label'] for f in (i.get('flags') or [])],
                        priorities=[dict(priority=c['label'], score_0_to_100=c.get('score'), weight=c.get('weight'), points=c.get('contribution'), why=c.get('explanation')) for c in (i.get('categories') or []) if c.get('status') != 'na'][:14])
    return dict(error='That school or teacher was not found.')


def _q_evidence(q):
    with get_conn() as conn:
        d = Data(conn)
        groups = engine.evidence(d, _today(), q.get('entity') or 'school', q.get('id') or '')
    out = []
    for g in groups[:12]:
        out.append(dict(priority=g['label'], status=g['status'], explanation=g['explanation'],
                        records=[dict(what=r['summary'], date=str(r['date']), file=(r.get('file') or {}).get('name')) for r in g['records'][:3]], more_records=max(0, len(g['records']) - 3)))
    return dict(groups=out)


def _q_chapters(q):
    from . import curriculum
    board = medium = None
    if q.get('school_id'):
        with get_conn() as conn:
            s = conn.execute('select board, medium from schools where id = %s', (q['school_id'],)).fetchone()
        if s: board, medium = s['board'], s['medium']
    res = curriculum.lookup(board, medium, q.get('class_no'), q.get('subject'))
    books = [dict(book=b['book'], chapters=b['chapters'][:40], total=len(b['chapters'])) for b in (res.get('books') or [])[:2]]
    return dict(books=books, note=res.get('note'))


def _records(school_id=None, teacher_id=None, limit=60):
    from ..api.assistant import records_text
    return records_text(school_id, teacher_id, limit=limit)


def _q_teacher_profile(q):
    tid = q.get('teacher_id')
    with get_conn() as conn:
        t = conn.execute('select t.full_name, t.title, t.designation, t.classes_taught, t.subjects_taught, s.name as school from teachers t join schools s on s.id = t.school_id where t.id = %s', (tid,)).fetchone()
        v = conn.execute("select started_at, class_no, subject, topic, result from visit_sessions where teacher_id = %s and status = 'evaluated' order by started_at desc limit 3", (tid,)).fetchall()
        a = conn.execute("select class_no, subject, chapter, report, reported_at from teacher_assessments where teacher_id = %s and status = 'reported' order by reported_at desc limit 1", (tid,)).fetchone()
    return dict(teacher=dict(t) if t else None,
                visits=[dict(date=str(x['started_at'].date()), cls=x['class_no'], subject=x['subject'], topic=x['topic'], overall=(x['result'] or {}).get('overall'),
                             went_well=[s.get('point') for s in ((x['result'] or {}).get('strengths') or [])[:3]], to_improve=[g.get('area') for g in ((x['result'] or {}).get('growth') or [])[:3]]) for x in v],
                assessment=None if not a else dict(date=str(a['reported_at'].date()), subject=a['subject'], chapter=a['chapter'], scores=(a['report'] or {}).get('scores')),
                records=_records(None, tid, 25))


def _q_school_profile(q):
    sid = q.get('school_id')
    with get_conn() as conn:
        s = conn.execute('select name, board, medium, village from schools where id = %s', (sid,)).fetchone()
        v = conn.execute("select started_at, mentor_name, class_no, subject, result from visit_sessions where school_id = %s and status = 'evaluated' order by started_at desc limit 4", (sid,)).fetchall()
    return dict(school=dict(s) if s else None,
                visits=[dict(date=str(x['started_at'].date()), by=x['mentor_name'], cls=x['class_no'], subject=x['subject'], overall=(x['result'] or {}).get('overall')) for x in v], records=_records(sid, None, 30))


def _q_assessment(q):
    with get_conn() as conn:
        a = conn.execute("select a.id, a.class_no, a.subject, a.chapter, a.report, a.reported_at, t.full_name from teacher_assessments a join teachers t on t.id = a.teacher_id "
                         "where a.teacher_id = %s and a.status = 'reported' order by a.reported_at desc limit 1", (q.get('teacher_id'),)).fetchone()
    if not a: return dict(error='There is no finished assessment for this teacher yet.')
    r = a['report'] or {}
    return dict(teacher=a['full_name'], date=str(a['reported_at'].date()), subject=a['subject'], class_no=a['class_no'], chapter=a['chapter'], scores=r.get('scores'),
                summary=r.get('summary'), suggestions=(r.get('suggestions') or [])[:5], visit_focus=(r.get('visit_focus') or [])[:5], misconceptions=(r.get('misconceptions') or [])[:4],
                questions=[dict(question=x.get('question'), score=x.get('score'), covered=x.get('covered'), missing=x.get('missing')) for x in (r.get('questions') or [])[:10]],
                note='Scores are 0 to 100: topic knowledge counts 60 percent and teaching method 40 percent. Confidence is only an indicator from the speaking, not a measure.')


def _q_records(q):
    r = ai.run('ask_copilot', dict(question=q.get('text') or '', records=_records(q.get('school_id'), q.get('teacher_id'), 400)[:60000], today=str(_today())))
    return dict(answer=r.data.get('answer'))


QUERIES = dict(ranking_explain=_q_ranking_explain, evidence=_q_evidence, chapters=_q_chapters, teacher_profile=_q_teacher_profile, school_profile=_q_school_profile, assessment=_q_assessment, records=_q_records)


def _clip(x, n=14000):
    import json
    s = json.dumps(x, ensure_ascii=False, default=str)
    return x if len(s) <= n else dict(truncated=True, text=s[:n])


SUBJECTS = {'maths': 'Mathematics', 'math': 'Mathematics', 'mathematics': 'Mathematics', 'arithmetic': 'Mathematics', 'ganit': 'Mathematics', 'english': 'English', 'marathi': 'Marathi',
            'hindi': 'Hindi', 'evs': 'EVS', 'environmental studies': 'EVS', 'environment': 'EVS', 'science': 'Science', 'general science': 'Science', 'social science': 'Social Science',
            'social studies': 'Social Science', 'social': 'Social Science', 'sst': 'Social Science', 'history': 'Social Science', 'geography': 'Social Science',
            'गणित': 'Mathematics', 'इंग्रजी': 'English', 'अंग्रेजी': 'English', 'अंग्रेज़ी': 'English', 'मराठी': 'Marathi', 'हिंदी': 'Hindi', 'हिन्दी': 'Hindi', 'विज्ञान': 'Science', 'सामान्य विज्ञान': 'Science',
            'पर्यावरण': 'EVS', 'परिसर अभ्यास': 'EVS', 'सामाजिक शास्त्र': 'Social Science', 'समाज विज्ञान': 'Social Science', 'सामाजिक विज्ञान': 'Social Science', 'ગણિત': 'Mathematics', 'கணிதம்': 'Mathematics',
            'గణితం': 'Mathematics', 'ಗಣಿತ': 'Mathematics', 'ഗണിതം': 'Mathematics', 'গণিত': 'Mathematics', 'অঙ্ক': 'Mathematics', 'ଗଣିତ': 'Mathematics', 'ریاضی': 'Mathematics'}


def _subject(x):
    """The subject as the app names it (the speech says 'maths', the app says 'Mathematics')."""
    return SUBJECTS.get(str(x or '').strip().lower(), x)


def _brief(text: str, words: int = 36) -> str:
    """The answer is spoken aloud, so it must be short: whole sentences are kept while they fit in about 36 words (at least the first one). When the CRP asked to have something read out
    or explained (`long`), about 110 words are allowed."""
    import re
    if len(text.split()) <= words: return text.strip()
    parts = re.split(r'(?<=[.!?।۔])\s+', text.strip()); out = []
    for p in parts:
        if out and len(' '.join(out + [p]).split()) > words: break
        out.append(p)
    return ' '.join(out).strip()


# The words of address (sir / madam) in the 11 languages, in their own scripts. The website hands one over only now and then; the AI sometimes adds one on its own: then it is removed.
_ADDRESS_WORDS = ['sir', 'madam', "ma'am", 'maam', 'सर', 'मैडम', 'मॅडम', 'स्यार', 'স্যার', 'ম্যাডাম', 'సార్', 'సర్', 'మేడం', 'சார்', 'மேடம்', 'સર', 'મેડમ', 'سر', 'میڈم', 'ಸರ್', 'ಮೇಡಂ', 'ସାର୍', 'ମ୍ୟାଡାମ୍', 'ସାର', 'സർ', 'സാർ', 'മാഡം']
_W = r'[\w\u0900-\u0DFF\u0600-\u06FF]'
_ADDR = r'(?<!' + _W + r')(?:' + '|'.join(re.escape(w) for w in sorted(_ADDRESS_WORDS, key=len, reverse=True)) + r')(?!' + _W + r')'


def _strip_address(text: str) -> str:
    """Removes 'sir' / 'madam' (and their equivalents) from an answer: ', sir.' -> '.', 'Sir, open' -> 'open', 'yes sir I can' -> 'yes I can'."""
    s = re.sub(_ADDR + r'\s*,\s*', '', text, flags=re.I)
    s = re.sub(r'\s*,?\s*' + _ADDR + r'\s*(?=[.!?\u0964\u06D4,]|$)', '', s, flags=re.I)
    s = re.sub(r'\s*' + _ADDR + r'\s*', ' ', s, flags=re.I)
    s = re.sub(r'\s+', ' ', s).replace(' ,', ',').replace(' .', '.').replace(' !', '!').replace(' ?', '?').strip()
    return s[:1].upper() + s[1:] if s and text[:1].isupper() else s


# The website asks "Shall I go ahead?" itself, and only before something that needs a yes; the AI sometimes adds the question on its own (also after something already done): it is removed.
_ASK_GO = ['क्या मैं आगे बढ़ूँ', 'क्या मैं आगे बढ़ूं', 'पुढे जाऊ का', 'আমি কি এগিয়ে যাব', 'ముందుకు వెళ్లనా', 'தொடரட்டுமா', 'હું આગળ વધું', 'کیا میں آگے بڑھوں', 'ಮುಂದುವರಿಯಲೇ', 'ମୁଁ ଆଗକୁ ବଢ଼ିବି କି', 'ഞാൻ തുടരട്ടെ',
           'आगे बढ़ूँ', 'आगे बढ़ूं', 'पुढे जाऊ', 'पुढे जायचे का', 'पुढे चालू करू का']
_ASK_RE = re.compile(r'[\s,;:.\-\u2013]*(?:(?:shall|should|may|can|could|do you want me to|would you like me to) i? ?(?:go ahead|proceed|do (?:it|that|this)|continue|carry on)(?: with (?:it|that|this))?|'
                     + '|'.join(re.escape(x) for x in _ASK_GO) + r')\s*[?\u061F]?\s*$', re.I)


_OFFER_RE = re.compile(r'(?:^|(?<=[.!?\u0964\u06D4]))\s*(?:shall|should) i\b[^.?!\u0964\u06D4]*\?\s*$|(?:^|(?<=[.!?\u0964\u06D4]))\s*(?:would you like me to|do you want me to)\b[^.?!\u0964\u06D4]*\?\s*$', re.I)


def _strip_ask(text: str) -> str:
    """'Opening the list, shall I go ahead?' -> 'Opening the list.'; 'It is on the Teachers page. Shall I open it?' -> 'It is on the Teachers page.'"""
    t = _OFFER_RE.sub('', text or '')
    t = _ASK_RE.sub('', t).rstrip(' ,;:-')
    return t + ('.' if t and t[-1] not in '.!?\u0964\u06D4' else '')


def _clean(d):
    """Drops the "unused" values (empty string, 0 class / count, -1 weight, null) that the schema needs, so only what the AI really meant is left."""
    if not isinstance(d, dict): return d
    out = {}
    for k, v in d.items():
        if v is None or v == '' or (k in ('class_no', 'count') and v == 0) or (k == 'weight' and v == -1) or (k == 'name' and v == 'none'): continue
        out[k] = _subject(v) if k == 'subject' else v
    return out


def _state(ps):
    """The screen the website sends can be long: the text of the page is kept to about 12 000 characters."""
    if isinstance(ps, dict) and isinstance(ps.get('screen_text'), str) and len(ps['screen_text']) > 12000:
        ps = dict(ps, screen_text=ps['screen_text'][:12000] + ' ... (the rest of the screen is not shown here)')
    return ps


def turn(body: dict) -> dict:
    """{utterance, language, page, page_state, history} -> {say, actions, took}."""
    t0 = time.time()
    inp = dict(language=body.get('language') or 'English', address=(body.get('address') or '').strip()[:8], utterance=(body.get('utterance') or '').strip()[:600], page=body.get('page'), page_state=_state(body.get('page_state')),
               history=(body.get('history') or [])[-6:], context=_context())
    r = ai.run('voice_turn', inp)
    out = r.data
    for _ in range(2):                                       # up to two lookups: the AI asks, the server looks, the AI answers
        q = _clean(out.get('query'))
        if not q or q.get('name') not in QUERIES: break
        try:
            data = QUERIES[q['name']](q)
        except Exception as e:
            data = dict(error=f'The lookup failed: {str(e)[:120]}')
        r = ai.run('voice_turn', dict(inp, data=_clip(data), lookup=q['name']))
        out = r.data
    actions = [_clean(a) for a in (out.get('actions') or [])]
    raw = _brief(out.get('say') or '', 170 if out.get('long') else 36)
    said = _strip_ask(raw)
    if not said and not actions: said = raw                             # a question that is the whole answer stays
    if not inp['address']: said = _strip_address(said)                  # the website decides when the CRP is addressed, not the AI
    return dict(say=said, actions=actions, took=round(time.time() - t0, 1), by=r.provider)
