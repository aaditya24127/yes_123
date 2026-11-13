"""The written visit report for the teacher (a PDF made from the evaluated visit).

Everything is short points in plain words: what went well, where to improve (with something to try), how the students did,
which questions to ask in class and how many, and what was agreed (with the follow-up date). No scores or jargon.
"""
import datetime as dt, hashlib, hmac, html, io, os, re

import pymupdf

from .prioritization.data import get_conn
from . import visit

GREEN = '#235347'

# Plain names for the teaching-practice scores.
PRACTICE = {
    'A1 Supportive learning environment': 'Friendly, supportive classroom', 'A2 Positive behavioural expectations': 'Clear and positive rules for behaviour',
    'Time on task': 'Time spent on learning', 'B1 Lesson facilitation': 'Clear explanation of the lesson', 'B2 Checks for understanding': 'Checking that students understand',
    'B3 Feedback': 'Feedback to students', 'B4 Critical thinking': 'Making students think', 'C1 Autonomy': 'Students taking charge of their learning',
    'C2 Perseverance': 'Students not giving up', 'C3 Social and collaborative skills': 'Students working together',
}
SCORE_WORD = {1: 'Needs a lot of work', 2: 'Needs work', 3: 'Fair', 4: 'Good', 5: 'Very good'}

# Question types: (name, how many in a lesson, what it checks)
TYPES = [
    ('recall', 'Remember', '1', 'Do students remember the facts?'),
    ('understand', 'Understand', '1 or 2', 'Can they say it in their own words?'),
    ('apply', 'Use it', '1', 'Can they use it in a new situation?'),
    ('reason', 'Think', '1', 'Can they say why, or how they know?'),
]
GENERIC = {
    'recall': 'What did we learn today about {t}?', 'understand': 'Tell me about {t} in your own words.',
    'apply': 'Where can you see {t} at home or in the village?', 'reason': 'How do you know your answer is right?',
}


def sig(sid: str) -> str:
    """Signed link code, so a teacher can open only the report that was sent to them."""
    secret = os.environ.get('TEACHER_AUTH_SECRET', 'dev-only-change-me').encode()
    return hmac.new(secret, f'report:{sid}'.encode(), hashlib.sha256).hexdigest()[:32]


def sig_ok(sid: str, given: str) -> bool:
    return hmac.compare_digest(sig(sid), given or '')


def sentences(text, limit=5):
    """Split a paragraph into short points."""
    parts = [p.strip() for p in re.split(r'(?<=[.!?])\s+', (text or '').strip()) if p.strip()]
    return parts[:limit]


def _e(x) -> str: return html.escape(str(x if x is not None else ''))
def _d(d) -> str: return d.strftime('%d %b %Y').lstrip('0')
def _ul(items): return '<ul>' + ''.join(f'<li>{x}</li>' for x in items) + '</ul>' if items else '<p class="none">Nothing to add this time.</p>'
def _clean(x): return re.sub(r'^\[O\d+\]\s*', '', str(x or '')).strip()


def filename(s) -> str:
    who = re.sub(r'[^A-Za-z0-9]+', '_', ((s['brief'] or {}).get('teacher') or {}).get('name') or (s['brief'] or {}).get('who') or 'visit').strip('_')
    return f"Visit_report_{who}_{s['started_at']:%Y-%m-%d}.pdf"


def build_html(s) -> str:
    b, r = s['brief'] or {}, s['result'] or {}
    teacher = (b.get('teacher') or {}).get('name'); school = (b.get('school') or {}).get('name', '')
    when = s['started_at'].date()
    days = int(s.get('followup_days') or 14)
    follow = when + dt.timedelta(days=days)
    meta = [f'<b>Teacher:</b> {_e(teacher)}' if teacher else None, f'<b>School:</b> {_e(school)}',
            f"<b>Class:</b> {_e(s['class_no'])}" if s['class_no'] else None, f"<b>Subject:</b> {_e(s['subject'])}" if s['subject'] else None,
            f"<b>Topic:</b> {_e(s['topic'])}" if s['topic'] else None, f'<b>Visit date:</b> {_d(when)}']
    h = [f'<h1>Visit report</h1><p class="meta">{" &nbsp;|&nbsp; ".join(m for m in meta if m)}</p>']

    h.append('<h2>1. In short</h2>' + _ul([_e(x) for x in sentences(r.get('overall'), 4)]))

    good = [f"<b>{_e(x.get('point'))}</b>" + (f"<br/><span class='small'>What we saw: {_e(x.get('evidence'))}</span>" if x.get('evidence') else '') for x in r.get('strengths', [])]
    h.append('<h2>2. What went well</h2>' + _ul(good))

    grow = r.get('growth', [])
    h.append('<h2>3. Where to improve</h2>')
    if not grow: h.append('<p class="none">No big problems were seen. Keep doing what you are doing.</p>')
    for i, g in enumerate(grow, 1):
        h.append(f"<h3>{i}. {_e(g.get('area'))}</h3>" + _ul([f"<b>What we saw:</b> {_e(g.get('evidence'))}", f"<b>Why it matters:</b> {_e(g.get('why'))}",
                                                           f"<b>What to try:</b> {_e(g.get('try_this'))}"]))

    st = r.get('students') or {}
    stu = [_e(x) for x in sentences(st.get('summary'), 4)]
    for q in st.get('per_question', []):
        m = q.get('mentor') or {}
        label = {'correct': 'Correct', 'partly': 'Partly correct', 'wrong': 'Not correct'}.get(m.get('verdict')) if m.get('verdict') in ('correct', 'partly', 'wrong') else None
        stu.append(f"<b>{_e(q.get('question'))}</b> &ndash; {_e(label or q.get('verdict'))}" + (" <span class='small'>(checked by the CRP)</span>" if label else '')
                   + (f". <span class='small'>{_e(m.get('reason') or q.get('note'))}</span>" if (m.get('reason') or q.get('note')) else ''))
    h.append('<h2>4. How your students did</h2>' + _ul(stu))
    if st.get('misconceptions'): h.append('<h3>Ideas students mixed up</h3>' + _ul([_e(x) for x in st['misconceptions']]))

    # --- what questions to ask, and how many
    topic = s['topic'] or 'today\'s lesson'
    used = {q.get('level'): q for q in (s['questions'] or [])}
    rows = ''
    for code, name, count, what in TYPES:
        ex = (used.get(code) or {}).get('question') or GENERIC[code].format(t=topic)
        rows += f"<tr><td><b>{name}</b></td><td>{count}</td><td>{what}</td><td>{_e(ex)}</td></tr>"
    h.append('<h2 class="newpage">5. Questions to ask in your lessons</h2><h3>How many, and what kind</h3>'
             + _ul(['Ask <b>4 to 5 questions</b> in every lesson: 1 or 2 in the middle and the rest near the end.',
                    'Mix the types below, so you learn who only remembers and who really understands.']))
    h.append(f'<table><tr><th>Type</th><th>How many</th><th>What it checks</th><th>Example</th></tr>{rows}</table>')
    h.append('<h3>How to ask</h3>' + _ul(['Keep each question short and simple, in the language the class speaks.', 'Wait 3 to 5 seconds before choosing a student.',
                                          'Ask different students: back rows, girls and boys, not only the ones who raise a hand.',
                                          'After a right answer, ask &ldquo;How do you know?&rdquo;', 'If the answer is wrong, ask a smaller question or let another student help.']))
    qs = s['questions'] or []
    if qs:
        h.append('<h3>Questions we asked your students in this visit</h3>')
        h.append('<ol>' + ''.join(f"<li><b>{_e(q.get('question'))}</b><br/><span class='small'>A good answer: {_e(q.get('good_answer'))}</span></li>" for q in qs) + '</ol>')

    pr = [x for x in r.get('rubric', []) if x.get('score')]
    if pr:
        rows = ''.join(f"<tr><td>{_e(PRACTICE.get(x['element'], x['element']))}</td><td>{x['score']} of 5 &ndash; {SCORE_WORD.get(int(x['score']), '')}</td></tr>" for x in pr)
        h.append(f'<h2>6. Teaching practices we looked at</h2><table><tr><th>Practice</th><th>How it went</th></tr>{rows}</table>')

    steps = [f"<b>{_e(n.get('action'))}</b>" + (f" <span class='small'>({_e(n.get('who'))})</span>" if n.get('who') else '') for n in r.get('next_steps', [])]
    h.append(f'<h2>{7 if pr else 6}. What we agreed to do next</h2>' + _ul(steps))
    h.append(f'<p class="box">Your CRP will follow up within <b>{days} days</b>, by <b>{_d(follow)}</b>.</p>')
    return '<body>' + ''.join(h) + '</body>'


CSS = f"""
body {{ font-family: sans-serif; font-size: 10.5pt; line-height: 1.35; color: #1f2937; }}
h1 {{ font-size: 22pt; color: {GREEN}; margin: 0 0 4pt 0; }}
h2 {{ font-size: 14pt; color: {GREEN}; margin: 16pt 0 4pt 0; border-bottom: 1px solid #bcdcc4; padding-bottom: 2pt; }}
h3 {{ font-size: 11.5pt; color: #163832; margin: 9pt 0 2pt 0; }}
h2.newpage {{ page-break-before: always; }}
p.meta {{ color: #4b5563; font-size: 10pt; margin: 0 0 6pt 0; }}
p.none {{ color: #6b7280; margin: 2pt 0; }}
p.box {{ background-color: #edf6ee; padding: 8pt; margin-top: 10pt; font-size: 11.5pt; }}
ul, ol {{ margin: 2pt 0 4pt 0; }}
li {{ margin-bottom: 3pt; }}
.small {{ font-size: 9.5pt; color: #4b5563; }}
table {{ width: 100%; border-collapse: collapse; margin: 4pt 0; }}
th {{ background-color: #edf6ee; text-align: left; padding: 4pt; border: 1px solid #bcdcc4; font-size: 10pt; }}
td {{ padding: 4pt; border: 1px solid #d5e4d9; vertical-align: top; font-size: 10pt; }}
"""


def make_pdf(s) -> bytes:
    buf = io.BytesIO()
    media = pymupdf.paper_rect('a4')
    where = media + (46, 48, -46, -56)
    writer = pymupdf.DocumentWriter(buf)
    story = pymupdf.Story(html=build_html(s), user_css=CSS)
    more = 1
    while more:
        dev = writer.begin_page(media)
        more, _ = story.place(where)
        story.draw(dev)
        writer.end_page()
    writer.close()
    doc = pymupdf.open(stream=buf.getvalue(), filetype='pdf')
    who = ((s['brief'] or {}).get('teacher') or {}).get('name') or (s['brief'] or {}).get('who') or ''
    for i, page in enumerate(doc, 1):
        page.insert_text((46, media.height - 30), f"Visit report  |  {who}", fontsize=8, color=(0.4, 0.45, 0.5))
        page.insert_text((media.width - 46 - 40, media.height - 30), f'Page {i} of {len(doc)}', fontsize=8, color=(0.4, 0.45, 0.5))
    out = doc.tobytes(deflate=True)
    doc.close()
    return out


def build(sid: str):
    """(file name, pdf bytes) for a visit session."""
    with get_conn() as conn:
        s, _ = visit.load_session(conn, sid)
    if not (s['result'] or {}).get('overall'): raise ValueError('Evaluate the visit first, then make the report.')
    return filename(s), make_pdf(s)
