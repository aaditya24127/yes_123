"""The visit report as a web page in the teacher's language.

The teacher gets a link (not a file). The page asks for the language, then shows the report or plays the CRP's short voice message.
Everything the AI wrote in the evaluation (summary, what went well, what to improve, the reasons, the next steps ...) is translated into the chosen
language by the AI (task `report_translate`, a few seconds, then kept); the headings come from a fixed list of labels translated once per language.
Names, school names, chapters and numbers stay as they are. English needs no translation.
"""
import concurrent.futures as cf
import hashlib
import json
import os

from .. import ai
from ..core.storage import get_storage
from .prioritization.data import get_conn
from . import visit
from .voice import NAMES

# Headings and words of the page (English). Translated once per language and kept.
LABELS = [
    'Visit report', 'Prepared for', 'School', 'Class', 'Subject', 'Topic', 'Date', 'Visited by', 'Summary', 'What went well', 'What to improve', 'Try this',
    'What the students answered', 'Why the students found it hard', 'What you can do', 'Agreed next steps', 'in {n} days', 'Teaching practices', 'Correct', 'Not correct',
    'Partly correct', 'Not heard', 'Nothing to add this time.', 'Save as PDF', 'Choose your language', 'What would you like to see?', 'Report', 'The written report of the visit',
    "Your CRP's short review", 'A short voice message about the visit', 'Back', 'Play', 'Getting it ready…', 'Preparing the voice message in your language. This takes a few seconds.',
    'Read what the voice says', 'This link is not valid.', 'The report could not be opened. Please try again.', 'The voice message could not be made. Please try again.',
    'Translating the report…', 'Change language', 'Seen in class', 'out of 5', 'Next visit in about {n} days.',
    'Hello {name}, your visit report and a short voice message from your CRP are ready. Open this link and choose what you want to see:',
]

TEXT_KEYS = {'overall', 'point', 'evidence', 'area', 'why', 'try_this', 'summary', 'question', 'note', 'issue', 'likely_reason', 'teacher_action', 'action', 'element'}
VERDICTS = {'correct': 'Correct', 'not correct': 'Not correct', 'partly correct': 'Partly correct', 'partly': 'Partly correct', 'not heard': 'Not heard'}


def site_url() -> str:
    """The address of the website, for links in chat messages and emails (PUBLIC_SITE_URL on the host)."""
    return (os.environ.get('PUBLIC_SITE_URL') or 'https://crp-mentor-copilot.vercel.app').rstrip('/')


def _first_str(x, *keys):
    for k in keys:
        v = x.get(k)
        if isinstance(v, str) and v.strip(): return v.strip()
    return ''


def build_content(s) -> dict:
    """The report as plain data (English), from the evaluated visit."""
    r = s['result'] or {}
    brief = s['brief'] or {}
    t = brief.get('teacher') or {}
    stu = r.get('students') or {}
    answers = []
    for q in stu.get('per_question') or []:
        v = str(q.get('verdict') or '').strip()
        answers.append(dict(question=q.get('question') or '', verdict=VERDICTS.get(v.lower(), v), note=q.get('note') or ''))
    return dict(
        meta=dict(teacher=t.get('name') or brief.get('who') or '', school=(brief.get('school') or {}).get('name') or '', class_no=s['class_no'], subject=s['subject'] or '', topic=s['topic'] or '',
                  date=s['started_at'].strftime('%Y-%m-%d') if s.get('started_at') else '', crp=s.get('mentor_name') or ''),
        overall=r.get('overall') or '',
        strengths=[dict(point=x.get('point') or '', evidence=x.get('evidence') or '') for x in (r.get('strengths') or [])],
        growth=[dict(area=x.get('area') or '', why=x.get('why') or '', evidence=x.get('evidence') or '', try_this=x.get('try_this') or '') for x in (r.get('growth') or [])],
        students=dict(summary=stu.get('summary') or '', answers=answers,
                      reasons=[dict(issue=x.get('issue') or '', likely_reason=x.get('likely_reason') or '', teacher_action=x.get('teacher_action') or '') for x in (stu.get('reasons') or [])]),
        next_steps=[dict(action=x.get('action') or '', due_in_days=x.get('due_in_days')) for x in (r.get('next_steps') or [])],
        follow_up_days=s.get('followup_days') or 14,
        practices=[dict(element=x.get('element') or '', score=x.get('score'), evidence=x.get('evidence') or '') for x in (r.get('rubric') or [])])


def _walk(obj, found):
    """Collects (container, key) of every text to translate."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in TEXT_KEYS and isinstance(v, str) and v.strip(): found.append((obj, k))
            else: _walk(v, found)
    elif isinstance(obj, list):
        for v in obj: _walk(v, found)


def _translate(language: str, texts: list[str]) -> list[str]:
    """The texts in the language, in the same order. A chunk that cannot be translated stays in English."""
    name = NAMES.get(language, 'English')
    chunks = [texts[i:i + 22] for i in range(0, len(texts), 22)]

    def one(chunk):
        for attempt in range(2):
            try:
                r = ai.run('report_translate', dict(language=name, items=chunk))
                out = r.data.get('items')
                if isinstance(out, list) and len(out) == len(chunk) and all(isinstance(x, str) and x.strip() for x in out): return out
            except Exception:
                pass
        return chunk
    with cf.ThreadPoolExecutor(max(1, min(4, len(chunks)))) as ex:
        parts = list(ex.map(one, chunks))
    return [x for p in parts for x in p]


def labels(language: str) -> dict:
    """{English label: label in the language}, translated once and kept."""
    if language == 'en': return {k: k for k in LABELS}
    st = get_storage(); key = f'reportview/_labels/{language}.json'
    try:
        if st.exists(key): return json.loads(st.get(key))
    except Exception:
        pass
    out = dict(zip(LABELS, _translate(language, LABELS)))
    try: st.put(key, json.dumps(out, ensure_ascii=False).encode('utf8'), 'application/json')
    except Exception: pass
    return out


def view(sid: str, language: str) -> dict:
    """What the report page shows, in the language: {content, labels, language, translated}."""
    language = language if language in NAMES else 'en'
    with get_conn() as conn:
        s, _ = visit.load_session(conn, sid)
    if not (s['result'] or {}).get('overall'): raise ValueError('This report is not ready.')
    content = build_content(s)
    if language == 'en': return dict(content=content, labels=labels('en'), language='en', translated=False)
    h = hashlib.sha1(json.dumps([content, language], sort_keys=True, default=str).encode('utf8')).hexdigest()[:12]
    st = get_storage(); key = f'reportview/{sid}/{language}_{h}.json'
    try:
        if st.exists(key): return json.loads(st.get(key))
    except Exception:
        pass
    found = []; _walk(content, found)
    texts = [c[k] for c, k in found]
    out = _translate(language, texts) if texts else []
    for (c, k), v in zip(found, out): c[k] = v
    res = dict(content=content, labels=labels(language), language=language, translated=any(a != b for a, b in zip(texts, out)))
    try: st.put(key, json.dumps(res, ensure_ascii=False, default=str).encode('utf8'), 'application/json')
    except Exception: pass
    return res
