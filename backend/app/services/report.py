"""The written visit report for the teacher (a PDF made from the evaluated visit).

About 8 pages, plain words, spacious: how the visit went with a score and charts (including 3D), then and now (what changed since the last
visit), what went well, where to improve, hands-on ideas for the class (chalk, pencils, the school yard), how the students did, the questions
to ask, what was agreed and the research behind it. The wording that is fixed (ideas, research, tips) is written by hand in `report_ideas.py`;
only the notes about this visit come from the evaluation.
"""
import datetime as dt, hashlib, hmac, html, io, os, re

from .prioritization.data import get_conn
from . import report_charts as ch, report_ideas as ideas, visit
from .pdf_fonts import Paragraph          # Indian-script names and chapters need their own fonts

GREEN, TEAL, SAND, AMBER, CORAL, INK, MUTED = '#235347', '#2f8f7a', '#f4f1e8', '#e3a73b', '#d8674f', '#1f2a27', '#5d6b66'

# Plain names for the teaching-practice scores (long and short).
PRACTICE = {
    'A1 Supportive learning environment': 'Friendly, supportive classroom', 'A2 Positive behavioural expectations': 'Clear and positive rules for behaviour',
    'Time on task': 'Time spent on learning', 'B1 Lesson facilitation': 'Clear explanation of the lesson', 'B2 Checks for understanding': 'Checking that students understand',
    'B3 Feedback': 'Feedback to students', 'B4 Critical thinking': 'Making students think', 'C1 Autonomy': 'Students taking charge of their learning',
    'C2 Perseverance': 'Students not giving up', 'C3 Social and collaborative skills': 'Students working together',
}
SHORT = {
    'A1 Supportive learning environment': 'Friendly classroom', 'A2 Positive behavioural expectations': 'Clear rules', 'Time on task': 'Learning time',
    'B1 Lesson facilitation': 'Clear lesson', 'B2 Checks for understanding': 'Checking understanding', 'B3 Feedback': 'Feedback',
    'B4 Critical thinking': 'Making them think', 'C1 Autonomy': 'Taking charge', 'C2 Perseverance': 'Not giving up', 'C3 Social and collaborative skills': 'Working together',
}
ORDER = list(PRACTICE)
SCORE_WORD = {1: 'Needs a lot of work', 2: 'Needs work', 3: 'Fair', 4: 'Good', 5: 'Very good'}

TYPES = [  # (code, name, how many, what it checks)
    ('recall', 'Remember', '1', 'Do students remember the facts?'),
    ('understand', 'Understand', '1 or 2', 'Can they say it in their own words?'),
    ('apply', 'Use it', '1', 'Can they use it in a new situation?'),
    ('reason', 'Think', '1', 'Can they say why, or how they know?'),
]
GENERIC = {
    'recall': 'What did we learn today about {t}?', 'understand': 'Tell me about {t} in your own words.',
    'apply': 'Where can you see {t} at home or in the village?', 'reason': 'How do you know your answer is right?',
}
LEVEL_NAME = {'recall': 'Remember', 'understand': 'Understand', 'apply': 'Use it', 'reason': 'Think', 'foundational': 'Basic reading'}


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
def _clean(x): return re.sub(r'^\[O\d+\]\s*', '', str(x or '')).strip()
def _ul(items): return '<ul>' + ''.join(f'<li>{x}</li>' for x in items) + '</ul>' if items else '<p class="none">Nothing to add this time.</p>'


def filename(s) -> str:
    who = re.sub(r'[^A-Za-z0-9]+', '_', ((s['brief'] or {}).get('teacher') or {}).get('name') or (s['brief'] or {}).get('who') or 'visit').strip('_')
    return f"Visit_report_{who}_{s['started_at']:%Y-%m-%d}.pdf"


# ---------------------------------------------------------------------------------------------- the facts behind the pictures
def _verdict(q):
    """The final word on a student answer: the mentor's check if there is one, otherwise the AI's wording read as correct / partly / not correct."""
    m = q.get('mentor') or {}
    if m.get('verdict') in ('correct', 'partly', 'wrong'): return m['verdict'], True
    t = (q.get('verdict') or '').lower()
    if re.search(r'\bnot\b|wrong|incorrect|\bno\b|mix', t): return 'wrong', False
    if re.search(r'partial|partly|some|half|almost', t): return 'partly', False
    if re.search(r'correct|right|good|well|clear', t): return 'correct', False
    return 'partly', False


def _history(s):
    """What we can compare with: the practice scores of the last visit, and the last two test results for this class and subject."""
    with get_conn() as conn:
        prev = conn.execute("""select started_at, result from visit_sessions where school_id = %s and (%s::uuid is null or teacher_id = %s) and status in ('evaluated', 'saved')
                               and started_at < %s and jsonb_typeof(result->'rubric') = 'array' order by started_at desc limit 1""",
                            (s['school_id'], s['teacher_id'], s['teacher_id'], s['started_at'])).fetchone()
        q = "select class_no, subject, assessment_date, students_assessed, students_below from assessments where school_id = %s and validation_status = 'valid' and students_assessed > 0"
        args = [s['school_id']]
        if s['class_no']: q += ' and class_no = %s'; args.append(s['class_no'])
        if s['subject']: q += ' and lower(subject) = lower(%s)'; args.append(s['subject'])
        tests = conn.execute(q + ' order by assessment_date', args).fetchall()
    last = {}
    for t in tests: last.setdefault((t['class_no'], t['subject']), []).append(t)
    pairs = []
    for (c, sub), rows in last.items():
        by_date = {}
        for r in rows: by_date[r['assessment_date']] = round(100 * r['students_below'] / r['students_assessed'])
        ds = sorted(by_date)
        pairs.append(dict(label=f'Class {c} {sub}', before=by_date[ds[-2]] if len(ds) > 1 else None, now=by_date[ds[-1]], d_before=ds[-2] if len(ds) > 1 else None, d_now=ds[-1]))
    pairs.sort(key=lambda p: (p['before'] is None, p['label']))
    return (prev['started_at'].date(), {x['element']: x['score'] for x in prev['result']['rubric'] if x.get('score')}) if prev else (None, {}), pairs[:5]


def _card(color, body, soft):
    return f'<table class="card" style="border-left: 5pt solid {color}; background-color: {soft};"><tr><td>{body}</td></tr></table><p class="gap"></p>'


def _img(name, w=500): return f'<p class="center"><img src="{name}" width="{w}"/></p>'


# ---------------------------------------------------------------------------------------------- the document
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, CondPageBreak, Frame, HRFlowable, Image, KeepTogether, PageBreak, PageTemplate, Spacer, Table, TableStyle

import matplotlib

_fonts = os.path.join(matplotlib.get_data_path(), 'fonts', 'ttf')                 # DejaVu Sans ships with matplotlib: no download, nice quotes and signs
for _n, _f in (('DV', 'DejaVuSans.ttf'), ('DV-B', 'DejaVuSans-Bold.ttf'), ('DV-I', 'DejaVuSans-Oblique.ttf'), ('DV-BI', 'DejaVuSans-BoldOblique.ttf')):
    pdfmetrics.registerFont(TTFont(_n, os.path.join(_fonts, _f)))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DV-B', italic='DV-I', boldItalic='DV-BI')

C = lambda h: colors.HexColor(h)
W = A4[0] - 92                                    # width between the margins
BODY = ParagraphStyle('body', fontName='DV', fontSize=10, leading=15, textColor=C(INK), spaceAfter=4)
SMALL = ParagraphStyle('small', parent=BODY, fontSize=8.6, leading=12.2, textColor=C(MUTED), spaceAfter=2)
CELL = ParagraphStyle('cell', parent=BODY, fontSize=9.2, leading=12.8, spaceAfter=0)
CELLC = ParagraphStyle('cellc', parent=CELL, alignment=TA_CENTER)
HEAD = ParagraphStyle('head', parent=CELL, fontName='DV-B', textColor=colors.white)
H2 = ParagraphStyle('h2', fontName='DV-B', fontSize=17, leading=21, textColor=C(GREEN), spaceBefore=20, spaceAfter=2)
H3 = ParagraphStyle('h3', fontName='DV-B', fontSize=11.6, leading=15, textColor=C('#163832'), spaceBefore=10, spaceAfter=3)
TAG = ParagraphStyle('tag', fontName='DV-B', fontSize=7.8, leading=10, spaceAfter=1)
CARDT = ParagraphStyle('cardt', fontName='DV-B', fontSize=11.2, leading=14.5, textColor=C('#163832'), spaceAfter=3)
CARDB = ParagraphStyle('cardb', parent=BODY, fontSize=9.6, leading=14, spaceAfter=3)
STEP = ParagraphStyle('step', parent=CARDB, leftIndent=15, firstLineIndent=-15, spaceAfter=2)
BUL = ParagraphStyle('bul', parent=BODY, leftIndent=14, firstLineIndent=-10, spaceAfter=3)


def P(t, st=BODY): return Paragraph(t, st)
def bullets(items): return [Paragraph('&bull;&nbsp;&nbsp;' + x, BUL) for x in items] or [Paragraph('Nothing to add this time.', SMALL)]


def h2(text, hard=False, room=240):
    """A section title. It starts a new page when it is asked to (`hard`) or when less than `room` points are left on this one."""
    return [PageBreak() if hard else CondPageBreak(room)] + [Paragraph(_e(text), H2), HRFlowable(width='100%', thickness=2, color=C('#cfe3d6'), spaceBefore=1, spaceAfter=8)]


def card(color, soft, flow):
    t = Table([[flow]], colWidths=[W])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C(soft)), ('LINEBEFORE', (0, 0), (0, -1), 4.5, C(color)), ('LEFTPADDING', (0, 0), (-1, -1), 13), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
                           ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    return KeepTogether([t, Spacer(1, 7)])


def grid(head, rows, widths, align=()):
    data = [[Paragraph(h, HEAD) for h in head]] + [[c if not isinstance(c, str) else Paragraph(c, CELLC if i in align else CELL) for i, c in enumerate(r)] for r in rows]
    t = Table(data, colWidths=[W * w for w in widths], repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), C(GREEN)), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('GRID', (0, 0), (-1, -1), 0.5, C('#d3e2d8')),
                           ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, C('#f5f9f6')]), ('LEFTPADDING', (0, 0), (-1, -1), 7), ('RIGHTPADDING', (0, 0), (-1, -1), 7),
                           ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    return t


def pic(png, width):
    iw, ih = ImageReader(io.BytesIO(png)).getSize()
    im = Image(io.BytesIO(png), width=width, height=width * ih / iw); im.hAlign = 'CENTER'
    return im


def up(t): return f'<font color="#1f7a4d"><b>{t}</b></font>'
def down(t): return f'<font color="#c0452d"><b>{t}</b></font>'
def same(t): return f'<font color="{MUTED}">{t}</font>'
def mid(t): return f'<font color="#a8741a"><b>{t}</b></font>'


def visit_issue(x):
    """An earlier concern, in plain words (the stored text can look like "[O12] FLN_READING: ..." or already be plain)."""
    return _clean(x).replace('_', ' ').capitalize()


def build_story(s):  # noqa: C901  (one long page-by-page layout, kept in one place on purpose)
    b, r = s['brief'] or {}, s['result'] or {}
    teacher = (b.get('teacher') or {}).get('name'); school = (b.get('school') or {}).get('name', '')
    when = s['started_at'].date(); days = int(s.get('followup_days') or 14); follow = when + dt.timedelta(days=days)
    topic = s['topic'] or 'today\'s lesson'
    rubric = {x['element']: int(x['score']) for x in r.get('rubric', []) if x.get('score')}
    (prev_date, prev_rubric), tests = _history(s)
    els = [e for e in ORDER if e in rubric]
    avg = round(sum(rubric.values()) / len(rubric), 1) if rubric else None
    word = None if avg is None else 'Very good' if avg >= 4.3 else 'Good' if avg >= 3.5 else 'Fair' if avg >= 2.7 else 'Needs work'
    low = [e for e in els if rubric[e] <= 2]
    f = []

    # ---- page 1: cover
    sub = ' &nbsp;&middot;&nbsp; '.join(x for x in (_e(teacher or school), _e(s['subject'] or ''), f"Class {s['class_no']}" if s['class_no'] else '') if x)
    hero = Table([[[Paragraph('<font color="#bfe0cf">VISIT REPORT</font>', ParagraphStyle('k', fontName='DV-B', fontSize=9.5, leading=12)),
                    Paragraph('<font color="white">A look at your lesson</font>', ParagraphStyle('t', fontName='DV-B', fontSize=27, leading=33, spaceBefore=3, spaceAfter=4)),
                    Paragraph(f'<font color="#e5f2ea">{sub}</font>', ParagraphStyle('s', fontName='DV', fontSize=12, leading=16))]]], colWidths=[W])
    hero.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C(GREEN)), ('LEFTPADDING', (0, 0), (-1, -1), 24), ('TOPPADDING', (0, 0), (-1, -1), 24), ('BOTTOMPADDING', (0, 0), (-1, -1), 22)]))
    f += [hero, Spacer(1, 14)]
    meta_rows = [('Teacher', teacher), ('School', school), ('Class', s['class_no']), ('Subject', s['subject']), ('Topic', s['topic']), ('Visit date', _d(when)), ('Visited by', s.get('mentor_name'))]
    mt = Table([[Paragraph(f'<font color="{MUTED}">{k}</font>', BODY), Paragraph(f'<b>{_e(v)}</b>', BODY)] for k, v in meta_rows if v], colWidths=[W * 0.14, W * 0.44])
    mt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    ring = ch.score_ring(avg) if avg is not None else None
    right = [pic(ring, 118), Paragraph(f'<font color="{GREEN}"><b>{_e(word)}</b></font>', ParagraphStyle('w', fontName='DV-B', fontSize=13, leading=18, alignment=TA_CENTER, spaceBefore=4, spaceAfter=3)),
             Paragraph('Overall, from the teaching practices', ParagraphStyle('w2', parent=SMALL, alignment=TA_CENTER))] if ring else [Spacer(1, 1)]
    cov = Table([[mt, right]], colWidths=[W * 0.62, W * 0.38]); cov.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    f += [cov, Spacer(1, 14)]
    nstr, ngrow, nsteps = len(r.get('strengths', [])), len(r.get('growth', [])), len(r.get('next_steps', []))

    def box(n, label):
        return [Paragraph(f'<font size="25" color="{GREEN}"><b>{n}</b></font>', ParagraphStyle('bn', alignment=TA_CENTER, leading=30)), Paragraph(label, ParagraphStyle('bl', parent=CELLC, textColor=C(INK)))]
    gl = Table([[box(nstr, 'things went well'), '', box(ngrow, 'things to improve'), '', box(nsteps, 'steps we agreed')]], colWidths=[W * 0.31, W * 0.035, W * 0.31, W * 0.035, W * 0.31])
    gl.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, 0), C('#e3f1ea')), ('BACKGROUND', (2, 0), (2, 0), C('#fcefd2')), ('BACKGROUND', (4, 0), (4, 0), C('#e5ebf4')),
                            ('TOPPADDING', (0, 0), (-1, -1), 11), ('BOTTOMPADDING', (0, 0), (-1, -1), 11), ('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
    f += [gl, Spacer(1, 14), Paragraph('In short', H2), HRFlowable(width='100%', thickness=2, color=C('#cfe3d6'), spaceBefore=1, spaceAfter=8)]
    f += bullets([_e(x) for x in sentences(r.get('overall'), 4)])
    note = Table([[Paragraph('This report is for you, to use in your class. Read it once, pick one or two things and try them this week. At the next visit we will look at the change together.', CARDB)]], colWidths=[W])
    note.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C(SAND)), ('LEFTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, -1), 9), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
    f += [Spacer(1, 8), note]

    # ---- page 2: the picture of the lesson
    if els:
        f += h2('Your teaching, at a glance', hard=True)
        f.append(P('Each bar is a score from 1 (needs a lot of work) to 5 (very good). ' + ('The pale bar is the last visit and the dark bar is this visit.' if prev_rubric else 'This is the first visit on record, so this is where we start.')))
        f.append(pic(ch.bars3d([SHORT[e] for e in els], [rubric[e] for e in els], [prev_rubric.get(e) for e in els] if prev_rubric else None), W * 0.9))
        f += [Spacer(1, 6), grid(['No.', 'What we looked at', 'Score', 'How it went'], [[str(i), _e(PRACTICE[e]), f'{rubric[e]} of 5', SCORE_WORD.get(rubric[e], '')] for i, e in enumerate(els, 1)], [0.08, 0.5, 0.13, 0.29], align=(0, 2))]

    # ---- page 3: then and now
    f += h2('Then and now')
    if prev_rubric:
        rows = []
        for e in els:
            a, n = prev_rubric.get(e), rubric[e]
            chg = same('New') if a is None else up(f'Better (+{n - a})') if n > a else down(f'Lower (-{a - n})') if n < a else same('Same')
            rows.append([_e(PRACTICE[e]), '-' if a is None else str(a), f'<b>{n}</b>', chg])
        better = sum(1 for e in els if prev_rubric.get(e) is not None and rubric[e] > prev_rubric[e]); lower = sum(1 for e in els if prev_rubric.get(e) is not None and rubric[e] < prev_rubric[e])
        f.append(P(f'Last visit: <b>{_d(prev_date)}</b>. This visit: <b>{_d(when)}</b>. {better} {"thing is" if better == 1 else "things are"} better{f" and {lower} lower" if lower else ""}.'))
        f.append(grid(['What we looked at', 'Last visit', 'This visit', 'Change'], rows, [0.5, 0.15, 0.15, 0.2], align=(1, 2)))
    else:
        f.append(P('This is the first visit we have on record, so there is nothing to compare yet. The scores on the last page are your starting point. At the next visit this page will show, line by line, what has changed.'))
    cmp_rows = r.get('compared_with_before') or []
    if cmp_rows:
        wd = {'improved': up('Better'), 'same': same('Same'), 'worse': down('Worse'), 'not_seen': same('Not seen today')}
        f.append(Paragraph('Things we spoke about last time', H3))
        f.append(grid(['Earlier concern', 'Now', 'What we saw'], [[_e(visit_issue(c.get('issue'))), wd.get(c.get('change'), _e(c.get('change'))), f"<font color='{MUTED}'>{_e(c.get('evidence'))}</font>"] for c in cmp_rows], [0.34, 0.16, 0.5]))
    if tests:
        f.append(Paragraph('Test results: students who need extra help', H3))
        f.append(P('Lower is better. The number is the share of students who scored under 40% of the marks.', SMALL))
        f.append(pic(ch.compare_bars([t['label'] for t in tests], [t['before'] for t in tests], [t['now'] for t in tests], '%'), W * 0.86))
        rows = []
        for t in tests:
            chg = same('First test') if t['before'] is None else up(f'Better ({t["before"] - t["now"]} points fewer)') if t['now'] < t['before'] else down(f'More need help (+{t["now"] - t["before"]})') if t['now'] > t['before'] else same('Same')
            rows.append([_e(t['label']), '-' if t['before'] is None else f"{t['before']}%", f"<b>{t['now']}%</b>", chg])
        f.append(grid(['Class and subject', 'Earlier test', 'Latest test', 'Change'], rows, [0.36, 0.17, 0.17, 0.3], align=(1, 2)))

    # ---- what went well
    f += h2('What went well')
    f.append(P('These are things to keep doing. Students learn better when a good habit is repeated every day.'))
    for x in r.get('strengths', []):
        f.append(card(TEAL, '#eaf5f0', [Paragraph(_e(x.get('point')), CARDT)] + ([Paragraph(f"<font color='{MUTED}'>What we saw:</font> {_e(x.get('evidence'))}", CARDB)] if x.get('evidence') else [])))
    if not r.get('strengths'): f.append(P('We did not note a clear strength this time. Keep going: the next visit will look again.', SMALL))
    st = ideas.stage_for(s['class_no'])
    if st:
        f += [Paragraph(f'How children in {_e(st[0])} learn', H3), P(_e(st[1]))]

    # ---- where to improve
    grow = r.get('growth', [])
    f += h2('Where to improve')
    f.append(P('Do not try everything at once. Pick the first one or two, and try them for two weeks.'))
    if not grow: f.append(P('No big problems were seen. Keep doing what you are doing.', SMALL))
    for i, g in enumerate(grow, 1):
        tag, col, soft = {'critical': ('DO THIS FIRST', CORAL, '#fbeeea'), 'significant': ('IMPORTANT', AMBER, '#fdf4e0')}.get(g.get('severity'), ('SMALL CHANGE', '#6aa874', '#f0f6ee'))
        f.append(card(col, soft, [Paragraph(f'<font color="{col}">{tag}</font>', TAG), Paragraph(f'{i}. {_e(g.get("area"))}', CARDT),
                                  Paragraph(f'<b>What we saw:</b> {_e(g.get("evidence"))}', CARDB), Paragraph(f'<b>Why it matters:</b> {_e(g.get("why"))}', CARDB),
                                  Paragraph(f'<b>What to try:</b> {_e(g.get("try_this"))}', CARDB)]))

    # ---- hands-on ideas
    chosen = ideas.pick(grow, low, s['subject'], s['class_no'], topic=s['topic'])
    board_cols = [('Today I learn', [topic, 'One new word or rule, written large']), ('Example (we do)', ['Draw it or hold the real thing', 'Write each step; say it aloud', 'Leave it on the board']),
                  ('Now you try', ['Q1 ______', 'Q2 ______', 'One child writes the answer here'])]
    f += h2('Teach it with things around you')
    f.append(P('Children remember what they touch, draw and say. These ideas cost almost nothing: chalk, pencils, paper, stones, a rope and the school yard. We picked the ones that fit this lesson.'))
    f += [pic(ch.chalkboard(topic, board_cols), W * 0.92), Paragraph('A plan for your blackboard. Fill in the three parts before you start the class.', ParagraphStyle('cap', parent=SMALL, alignment=TA_CENTER)), Spacer(1, 8)]
    kinds = {'board': 'BLACKBOARD AND CHALK', 'hands': 'HANDS-ON', 'outdoor': 'OUTSIDE THE CLASSROOM', 'talk': 'TALK AND THINK', 'group': 'GROUP WORK'}
    for i, d in enumerate(chosen, 1):
        steps = [Paragraph(f'{k}.&nbsp;&nbsp;{_e(x)}', STEP) for k, x in enumerate(d['steps'], 1)]
        f.append(card(GREEN, SAND, [Paragraph(f'<font color="{TEAL}">{kinds[d["kind"]]}</font>', TAG), Paragraph(f'{i}. {_e(d["title"])}', CARDT), Paragraph(f'<b>You need:</b> {_e(d["things"])}', CARDB)] + steps
                                    + [Paragraph(f'<font color="{MUTED}"><b>Why it works:</b> {_e(d["why"])}</font>', ParagraphStyle('why', parent=CARDB, fontSize=8.6, leading=12, spaceBefore=3))]))

    # ---- students
    sts = r.get('students') or {}
    pq = sts.get('per_question') or []
    f += h2('How the students did')
    if sts.get('summary'): f += bullets([_e(x) for x in sentences(sts['summary'], 4)])
    if pq:
        counts = {'correct': 0, 'partly': 0, 'wrong': 0}
        for q in pq: counts[_verdict(q)[0]] += 1
        png = ch.pie3d([counts['correct'], counts['partly'], counts['wrong']], ['Correct', 'Partly correct', 'Not correct'], [GREEN, AMBER, CORAL])
        if png: f.append(pic(png, W * 0.62))
        rows = []
        for q in pq:
            v, by_crp = _verdict(q); m = q.get('mentor') or {}
            lab = {'correct': up('Correct'), 'partly': mid('Partly correct'), 'wrong': down('Not correct')}[v] + ('<br/><font size="7.5" color="%s">checked by your mentor</font>' % MUTED if by_crp else '')
            rows.append([_e(q.get('question')), lab, f"<font color='{MUTED}'>{_e(m.get('reason') or q.get('note'))}</font>"])
        f.append(grid(['Question we asked', 'Result', 'What we heard'], rows, [0.42, 0.2, 0.38]))
    elif not sts.get('summary'): f.append(P('No student answers were recorded this time.', SMALL))
    if sts.get('reasons'):
        f += [Paragraph('Why the students found it hard, and what to change', H3), P('This comes from what the students actually said, compared with what was taught.', SMALL)]
        for x in sts['reasons']:
            f.append(card(AMBER, '#fdf4e0', [Paragraph(_e(x.get('issue')), CARDT), Paragraph('<font color="%s">What we heard:</font> %s' % (MUTED, _e(x.get('evidence'))), CARDB),
                                           Paragraph('<font color="%s">Why it may have happened:</font> %s' % (MUTED, _e(x.get('likely_reason'))), CARDB), Paragraph('<b>What you can change:</b> %s' % _e(x.get('teacher_action')), CARDB)]))
    if sts.get('misconceptions'):
        f += [Paragraph('Ideas students mixed up', H3)] + bullets([_e(x) for x in sts['misconceptions']])
        f.append(P('Tip: do not only say the right answer. Ask the class to show the idea with a drawing, a rope or a pencil, and let them find the mistake themselves.', SMALL))

    # ---- questions
    used = {q.get('level'): q for q in (s['questions'] or [])}
    f += h2('Questions to ask in your lessons')
    f.append(P('Ask <b>4 to 5 questions</b> in every lesson: one or two in the middle and the rest near the end. Mix the types below, so you learn who only remembers and who really understands.'))
    f.append(grid(['Type', 'How many', 'What it checks', 'Example for this lesson'], [[f'<b>{n}</b>', c, w, _e((used.get(code) or {}).get('question') or GENERIC[code].format(t=topic))] for code, n, c, w in TYPES], [0.15, 0.11, 0.3, 0.44]))
    qs = s['questions'] or []
    if qs:
        f.append(Paragraph('The questions we asked your students, and what to listen for', H3))
        f.append(grid(['Type', 'Question', 'A good answer', 'If you hear this, change how you teach it'],
                      [[f"<b>{_e(LEVEL_NAME.get(q.get('level'), q.get('level')))}</b><br/><font size='7.5' color='{MUTED}'>{_e(q.get('ask_who'))}</font>", _e(q.get('question')), _e(q.get('good_answer')), f"<font color='{MUTED}'>{_e(q.get('watch_for'))}</font>"] for q in qs],
                      [0.16, 0.28, 0.26, 0.3]))
    f.append(Paragraph('How to ask', H3))
    f += bullets(['Keep each question short, in the language the class speaks.', 'Count slowly to five in your head before you choose a student.', 'Ask students from the back rows, girls and boys, not only the ones who raise a hand.',
                  'After a right answer, ask &ldquo;How do you know?&rdquo;', 'If the answer is wrong, ask a smaller question, or let another child help. Never laugh or scold.'])

    # ---- what we agreed + research
    steps = r.get('next_steps', [])
    f += h2('What we agreed to do next')
    if steps:
        rows = [[f"<b>{_e(n.get('action'))}</b>", _e(n.get('who') or 'Teacher'), _d(when + dt.timedelta(days=int(n.get('due_in_days') or days))), ' '] for n in steps]
        f.append(grid(['What', 'Who', 'By', 'Done'], rows, [0.56, 0.16, 0.17, 0.11]))
    else: f.append(P('No actions this time.', SMALL))
    bx = Table([[Paragraph(f'Your mentor will come back within <b>{days} days</b>, by <b>{_d(follow)}</b>, to look at the change with you.', ParagraphStyle('bx', parent=BODY, fontSize=11, leading=15))]], colWidths=[W])
    bx.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C('#e6f1ea')), ('LEFTPADDING', (0, 0), (-1, -1), 13), ('TOPPADDING', (0, 0), (-1, -1), 11), ('BOTTOMPADDING', (0, 0), (-1, -1), 9)]))
    f += [Spacer(1, 10), bx, CondPageBreak(330), Paragraph('Why we suggest these things', H3), P('Everything in this report follows what research on teaching has found, in plain words:', SMALL)]
    f.append(grid(['The idea', 'What it means in class'], [[f'<b>{_e(a)}</b>', f"{_e(b_)}<br/><font size='7.8' color='{MUTED}'>{_e(c)}</font>"] for a, b_, c in ideas.RESEARCH], [0.32, 0.68]))
    f.append(Spacer(1, 6))
    f.append(P('Sources: Black and Wiliam (1998) Inside the Black Box; Rosenshine (2012) Principles of Instruction; Bruner (1966) Toward a Theory of Instruction; Rowe (1986) Wait time, Journal of Teacher Education; '
               'Hattie and Timperley (2007) The Power of Feedback; Education Endowment Foundation (2021) Teaching and Learning Toolkit; Banerjee and others (2016) Teaching at the Right Level in India, NBER; '
               'Dunlosky and others (2013) Improving Students\' Learning, Psychological Science in the Public Interest; Kraft, Blazar and Hogan (2018) The Effect of Teacher Coaching, Review of Educational Research; '
               'Coe and others (2020) Great Teaching Toolkit; Ministry of Education (2021) NIPUN Bharat; NCERT (2023) National Curriculum Framework for School Education.', SMALL))
    return f


def make_pdf(s) -> bytes:
    buf = io.BytesIO()
    who = ((s['brief'] or {}).get('teacher') or {}).get('name') or (s['brief'] or {}).get('who') or ''
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=46, rightMargin=46, topMargin=44, bottomMargin=54, title='Visit report', author='CRP Mentor Copilot')

    def footer(canv, d):
        canv.saveState(); canv.setStrokeColor(C('#cfe3d6')); canv.setLineWidth(1); canv.line(46, 40, A4[0] - 46, 40)
        canv.setFont('DV', 7.8); canv.setFillColor(C('#6b7a74')); canv.drawString(46, 28, f'Visit report  |  {who}')
        canv.setFillColor(C(GREEN)); canv.drawRightString(A4[0] - 46, 28, f'Page {d.page}'); canv.restoreState()

    doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(46, 54, W, A4[1] - 98, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=footer)])
    doc.build(build_story(s))
    return buf.getvalue()


_cache: dict[str, tuple[str, bytes]] = {}          # the last few finished reports, so a second download or send does not draw everything again


def build(sid: str):
    """(file name, pdf bytes) for a visit session."""
    with get_conn() as conn:
        s, _ = visit.load_session(conn, sid)
    if not (s['result'] or {}).get('overall'): raise ValueError('Evaluate the visit first, then make the report.')
    key = hashlib.sha1(repr((str(sid), s['result'], s.get('followup_days'), s.get('mentor_name'), s['topic'], s['class_no'], s['subject'], s['questions'])).encode()).hexdigest()
    hit = _cache.get(key)
    if hit: return hit
    out = (filename(s), make_pdf(s))
    if len(_cache) >= 12: _cache.pop(next(iter(_cache)))
    _cache[key] = out
    return out
