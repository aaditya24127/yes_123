"""The PDF report of a teacher's before-visit assessment, for the CRP and the teacher.

Same look as the visit report (Evergreen colours, the app's logo and glowing circle on the cover), plain formal English, spacious pages. Scores are shown with flat bar and radar
charts; a 3D chart is used only for the summary on the first page. Everything in it comes from the saved report (services/assessment.py): the AI's judgement of the answers, plus
the speaking data and the confidence indicators that plain code measured.
"""
import datetime as dt, io

from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

from . import report_charts as ch
from .prioritization.data import get_conn
from .report import (AMBER, BODY, BUL, C, CARDB, CARDT, CELL, CELLC, CORAL, GREEN, H3, INK, MUTED, SAND, SMALL, TAG, TEAL, W, bullets, card, down, grid, h2, mid, pic, same, up)

_CACHE = {}
RATING_WORD = {'strong': ('Strong', up), 'some': ('Some', mid), 'weak': ('Weak', down), 'not_mentioned': ('Not mentioned', same),
               'good': ('Good', up), 'partly': ('Partly', mid), 'poor': ('Poor', down)}
FIX_WORD = {'correct': ('Correct', up), 'partly': ('Partly correct', mid), 'incorrect': ('Not correct', down), 'not_given': ('No fix described', same)}
FIT_WORD = {'fits': ('Fits', up), 'partly': ('Partly fits', mid), 'does_not_fit': ('Does not fit', down)}
BAND_WORD = {'high': 'High', 'medium': 'Medium', 'low': 'Low', 'not_measured': 'Not measured'}


def _e(x):
    import html
    return html.escape(str(x if x is not None else ''))


def _score_word(v):
    if v is None: return same('-')
    return up(f'{v}') if v >= 70 else mid(f'{v}') if v >= 50 else down(f'{v}')


def _word(table, key):
    w, f = table.get(key, (str(key or '-'), same))
    return f(_e(w))


def _band(c):
    if not c or c.get('band') == 'not_measured' or c.get('score') is None: return same('Not measured')
    t = f"{BAND_WORD.get(c['band'], c['band'])} ({c['score']})"
    return up(t) if c['band'] == 'high' else mid(t) if c['band'] == 'medium' else down(t)


def _box(num, label, sub, bg):
    return [Paragraph(f'<font size="26" color="{GREEN}"><b>{num if num is not None else "-"}</b></font>', ParagraphStyle('bn', fontName='DV-B', alignment=TA_CENTER, leading=30)),
            Paragraph(f'<b>{label}</b>', ParagraphStyle('bl', parent=CELLC, textColor=C(INK))), Paragraph(sub, ParagraphStyle('bs', parent=CELLC, fontSize=7.8, textColor=C(MUTED)))]


def story(a, r):
    ctx = r.get('context') or {}; sc = r.get('scores') or {}; qs = r.get('questions') or []
    f = []
    teacher = ctx.get('teacher') or a.get('teacher_name') or 'the teacher'
    logo, orb = ch.logo(), ch.orb()

    # ---- page 1: cover
    brand = Table([[Table([[Image(io.BytesIO(logo), width=30, height=30), Paragraph('<font color="white">CRP Mentor Copilot</font>', ParagraphStyle('lg', fontName='DV-B', fontSize=15, leading=18))]],
                          colWidths=[40, 190], style=TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0), ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0)])),
                    Paragraph('<font color="#bfe0cf">TEACHER ASSESSMENT REPORT</font>', ParagraphStyle('rt', fontName='DV-B', fontSize=8.5, alignment=TA_RIGHT))]], colWidths=[W * 0.55, W * 0.45])
    brand.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), C(GREEN)), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 18), ('RIGHTPADDING', (0, 0), (-1, -1), 18),
                               ('TOPPADDING', (0, 0), (-1, -1), 14), ('BOTTOMPADDING', (0, 0), (-1, -1), 14)]))
    f += [brand, Spacer(1, 22), Paragraph('Before-visit assessment', ParagraphStyle('t1', fontName='DV-B', fontSize=25, leading=30, textColor=C(GREEN))),
          Paragraph(f'Spoken questions on the subject and on how it is taught', ParagraphStyle('t2', fontName='DV', fontSize=11.5, leading=16, textColor=C(MUTED), spaceAfter=10))]
    meta = [('Teacher', teacher), ('School', ctx.get('school')), ('Board and medium', ' / '.join(x for x in (ctx.get('board'), ctx.get('medium')) if x)), ('Class', ctx.get('class_no')),
            ('Subject', ctx.get('subject')), ('Chapter', ctx.get('chapter')), ('Questions', ctx.get('count')), ('Asked on', ctx.get('date')), ('Asked by', ctx.get('requested_by'))]
    mt = Table([[Paragraph(f'<font color="{MUTED}">{k}</font>', BODY), Paragraph(f'<b>{_e(v)}</b>', BODY)] for k, v in meta if v], colWidths=[W * 0.17, W * 0.43])
    mt.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    cov = Table([[mt, Image(io.BytesIO(orb), width=118, height=118)]], colWidths=[W * 0.66, W * 0.34]); cov.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('ALIGN', (1, 0), (1, 0), 'CENTER'), ('LEFTPADDING', (0, 0), (-1, -1), 0)]))
    f += [cov, Spacer(1, 16)]
    boxes = Table([[_box(sc.get('knowledge'), 'Topic knowledge', '60% of the overall score', ''), '', _box(sc.get('teaching'), 'Teaching method', '40% of the overall score', ''), '',
                    _box(sc.get('overall'), 'Overall', 'weighted 60 / 40', ''), '', _box(sc.get('confidence'), 'Confidence', 'indicator only', '')]],
                  colWidths=[W * 0.235, W * 0.02, W * 0.235, W * 0.02, W * 0.235, W * 0.02, W * 0.235])
    boxes.setStyle(TableStyle([('BACKGROUND', (0, 0), (0, 0), C('#e3f1ea')), ('BACKGROUND', (2, 0), (2, 0), C('#fcefd2')), ('BACKGROUND', (4, 0), (4, 0), C('#dcebe3')), ('BACKGROUND', (6, 0), (6, 0), C('#eceef2')),
                               ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 10), ('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
    f += [boxes, Spacer(1, 10)]
    sm = ch.summary3d([('Topic knowledge', sc.get('knowledge'), ch.TEAL), ('Teaching method', sc.get('teaching'), ch.AMBER), ('Overall', sc.get('overall'), ch.BRAND)])
    if sm: f += [pic(sm, W * 0.8), Paragraph('Summary of the two scores and the overall result.', ParagraphStyle('cap', parent=SMALL, alignment=TA_CENTER))]

    # ---- page 2: scores in detail
    f += h2('Scores in detail', hard=True)
    if r.get('summary'): f.append(Paragraph(_e(r['summary']), BODY))
    labels = [f"Q{q['n']} {'Knowledge' if q['kind'] == 'knowledge' else 'Teaching'}" for q in qs]
    fl = ch.bars_flat(labels, [q['score'] for q in qs], [q['kind'] for q in qs])
    dims = r.get('dims') or []
    rd = ch.radar([d['label'] for d in dims], [d['value'] for d in dims]) if len(dims) >= 3 else None
    row = [[pic(fl, W * 0.5) if fl else '', pic(rd, W * 0.46) if rd else '']]
    t = Table(row, colWidths=[W * 0.52, W * 0.48]); t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    f += [Spacer(1, 4), t, Paragraph('Left: the score of each question. Right: the main areas on one picture (the last spoke is an indicator).', SMALL), Spacer(1, 6)]
    rows = [[str(q['n']), 'Knowledge' if q['kind'] == 'knowledge' else 'Teaching', _e(q['question']), _score_word(q['score']), _band(q.get('confidence'))] for q in qs]
    f.append(grid(['No.', 'Type', 'Question', 'Score', 'Confidence (indicator)'], rows, [0.07, 0.14, 0.51, 0.1, 0.18], align=(0, 3)))
    f.append(Spacer(1, 8))
    f.append(card(TEAL, '#eaf5f0', [Paragraph('How to read this report', CARDT)] + [Paragraph('&bull;&nbsp;&nbsp;' + t, ParagraphStyle('rb', parent=CARDB, leftIndent=12, firstLineIndent=-10)) for t in (
        'Scores run from 0 to 100. A score of 70 or more means the answer covered most of what was expected.',
        'Topic knowledge counts for 60% and teaching method for 40% of the overall score.',
        'The confidence figures are indicators. They come from how the answers were spoken (pauses, filler words, hedging). They are not a judgement of the teacher.',
        'The report uses only what the teacher said in this assessment. Recordings are not stored; only the words and the speaking data are kept.')]))

    # ---- the answers
    f += h2('What the teacher said', hard=True)
    f.append(Paragraph('A short summary or quote of each answer, how well it matched what a good answer contains, and the confidence indicator.', BODY))
    for q in qs:
        kind = 'KNOWLEDGE' if q['kind'] == 'knowledge' else 'TEACHING METHOD'; col, soft = (TEAL, '#eaf5f0') if q['kind'] == 'knowledge' else (AMBER, '#fdf4e0')
        body = [Paragraph(f'<font color="{col}">{kind} &nbsp;|&nbsp; QUESTION {q["n"]}</font>', TAG), Paragraph(_e(q['question']), CARDT),
                Paragraph(f'<font color="{MUTED}">The teacher said:</font> {_e(q.get("said"))}', CARDB),
                Paragraph(f'<b>Score:</b> {_score_word(q["score"])} out of 100 &nbsp;&nbsp;<b>Confidence:</b> {_band(q.get("confidence"))}', CARDB)]
        if q.get('covered'): body.append(Paragraph('<b>Covered:</b> ' + _e('; '.join(q['covered'])), CARDB))
        if q.get('missing'): body.append(Paragraph('<b>Not covered:</b> ' + _e('; '.join(q['missing'])), CARDB))
        sig = (q.get('confidence') or {}).get('signals') or []
        if sig: body.append(Paragraph(f'<font color="{MUTED}">Signals: {_e("; ".join(sig))}.</font>', ParagraphStyle('sg', parent=CARDB, fontSize=8.6, leading=12)))
        if q.get('comment'): body.append(Paragraph(_e(q['comment']), CARDB))
        f.append(card(col, soft, body))

    # ---- suggestions
    f += h2('Our suggestions', hard=True)
    f.append(card(TEAL, '#eaf5f0', [Paragraph('What the teacher did well', CARDT)] + [Paragraph('&bull;&nbsp;&nbsp;' + _e(x), ParagraphStyle('s1', parent=CARDB, leftIndent=12, firstLineIndent=-10)) for x in (r.get('strengths') or ['Nothing specific was noted.'])]))
    f.append(card(AMBER, '#fdf4e0', [Paragraph('What the teacher could change', CARDT)] + [Paragraph('&bull;&nbsp;&nbsp;' + _e(x), ParagraphStyle('s2', parent=CARDB, leftIndent=12, firstLineIndent=-10)) for x in (r.get('changes') or ['Nothing specific was noted.'])]))
    bm = r.get('better_methods') or []
    if bm:
        f += [Paragraph('Better tools and methods for this chapter and class', H3), grid(['Idea', 'Why it helps'], [[f"<b>{_e(x.get('idea'))}</b>", _e(x.get('why'))] for x in bm], [0.45, 0.55])]
    do, dont = r.get('do') or [], r.get('dont') or []
    n = max(len(do), len(dont))
    if n:
        f += [Paragraph('Do and do not: before the visit', H3), grid(['Do', 'Do not'], [[_e(do[i]) if i < len(do) else '', _e(dont[i]) if i < len(dont) else ''] for i in range(n)], [0.5, 0.5])]

    # ---- misconceptions, tools, classroom practice
    f += h2('Misconceptions, tools and classroom practice', hard=True)
    f.append(Paragraph('Student mistakes the teacher named', H3))
    mc = r.get('misconceptions') or []
    f.append(grid(['Mistake named', 'How the teacher would fix it', 'Is the fix correct?'], [[_e(m.get('misconception')), _e(m.get('fix_given')) + (f"<br/><font size='8' color='{MUTED}'>{_e(m.get('note'))}</font>" if m.get('note') else ''), _word(FIX_WORD, m.get('fix_is'))] for m in mc], [0.34, 0.46, 0.2])
             if mc else Paragraph('The teacher did not name any student mistakes. This is worth asking about during the visit.', BODY))
    f.append(Paragraph('Websites, simulations and materials the teacher named', H3))
    tl = r.get('tools') or []
    f.append(grid(['Name', 'Kind', 'Fit for this chapter and class', 'Note'], [[f"<b>{_e(t.get('name'))}</b>", _e(t.get('kind')), _word(FIT_WORD, t.get('fits')), _e(t.get('note'))] for t in tl], [0.25, 0.17, 0.2, 0.38])
             if tl else Paragraph('The teacher did not name any website, simulation or material.', BODY))
    f.append(Paragraph('Classroom practice, as shown in the answers', H3))
    cu, ws, bf = r.get('checking_understanding') or {}, r.get('weaker_students') or {}, r.get('board_class_fit') or {}
    f.append(grid(['Area', 'Rating', 'Note'], [['Checking understanding', _word(RATING_WORD, cu.get('rating')), _e(cu.get('note'))], ['Support for weaker students', _word(RATING_WORD, ws.get('rating')), _e(ws.get('note'))],
                                              ['Fit with the board and class', _word(RATING_WORD, bf.get('rating')), _e(bf.get('note'))]], [0.28, 0.15, 0.57]))

    # ---- speaking data and data quality
    f += h2('Speaking data and data quality', hard=True)
    sp, dq = r.get('speaking') or {}, r.get('data_quality') or {}
    f.append(Paragraph('Measured from the transcript and its timing. The speech-to-text step may leave out some filler words, so the filler count can be lower than what was said.', BODY))
    srows = []
    for q in qs:
        s_ = q.get('speaking') or {}
        srows.append([str(q['n']), _e(s_.get('seconds') if s_.get('seconds') is not None else '-'), _e(s_.get('words', 0)), _e(s_.get('wpm') if s_.get('wpm') else '-'), _e(s_.get('pauses', 0)), _e(s_.get('fillers', 0)), _e(s_.get('hedges', 0)), 'Voice' if s_.get('source') == 'voice' else 'Typed' if s_ else 'None'])
    f.append(grid(['No.', 'Seconds', 'Words', 'Pace (words a minute)', 'Long pauses', 'Filler words', 'Hedging phrases', 'Answer by'], srows, [0.07, 0.14, 0.1, 0.17, 0.13, 0.13, 0.14, 0.12], align=(0, 1, 2, 3, 4, 5, 6)))
    f.append(Spacer(1, 6))
    f.append(Paragraph(f"Average pace: <b>{_e(sp.get('avg_wpm') or '-')}</b> words a minute. Long pauses (over 2 seconds): <b>{_e(sp.get('pauses', 0))}</b>, the longest <b>{_e(sp.get('longest_pause', 0))}</b> seconds. "
                       f"Filler words: <b>{_e(sp.get('fillers', 0))}</b>. Hedging phrases: <b>{_e(sp.get('hedges', 0))}</b>.", BODY))
    rel = {'good': ('Good', up), 'fair': ('Fair', mid), 'low': ('Low', down)}.get(dq.get('reliability'), ('-', same))
    f.append(card(GREEN, SAND, [Paragraph('Data quality', CARDT), Paragraph(f"<b>Answered:</b> {_e(dq.get('answered'))} of {_e(dq.get('total'))} questions (by voice {_e(dq.get('by_voice'))}, typed {_e(dq.get('typed'))}). "
                                                                              f"<b>Average length:</b> {_e(dq.get('avg_words'))} words. <b>Reliability of the transcript and scores:</b> {rel[1](_e(rel[0]))}.", CARDB), Paragraph(_e(dq.get('note')), CARDB)]))
    focus = r.get('visit_focus') or []
    f.append(Paragraph('Points for the CRP to check during the visit', H3))
    f.append(card(CORAL, '#fbeeea', [Paragraph(f'<b>{i}.</b>&nbsp;&nbsp;{_e(x)}', ParagraphStyle('vf', parent=CARDB, leftIndent=16, firstLineIndent=-16)) for i, x in enumerate(focus, 1)] or [Paragraph('No focus points were written.', CARDB)]))
    f.append(Paragraph('Research basis and limits', H3))
    f.append(Paragraph('Teacher confidence is usually measured with self-report questionnaires. Scoring confidence from the way answers are spoken is a newer approach, so the confidence figures in this report are '
                       'indicators only and should not be used to judge a teacher. Teaching knowledge is usually assessed through interviews and written tasks, which supports the 60 / 40 design: '
                       '60% subject knowledge and 40% teaching method.', SMALL))
    ai = r.get('ai') or {}
    f.append(Paragraph(f"Questions written by {_e(a.get('questions_by') or '-')}; answers judged by {_e((ai.get('provider') or '-') + (' (' + ai['model'] + ')' if ai.get('model') else ''))}. "
                       f"Report made on {_e((r.get('generated_at') or '')[:10])}.", SMALL))
    return f


def make_pdf(a, r):
    """The PDF bytes for assessment row `a` and its saved report `r` (also used by tests, without a database)."""
    ctx = r.get('context') or {}
    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=46, rightMargin=46, topMargin=40, bottomMargin=54, title='Teacher assessment report', author='CRP Mentor Copilot')

    def footer(canv, d):
        canv.saveState(); canv.setStrokeColor(C('#cfe3d6')); canv.setLineWidth(1); canv.line(46, 40, A4[0] - 46, 40)
        canv.setFont('DV', 7.8); canv.setFillColor(C(MUTED)); canv.drawString(46, 28, f"CRP Mentor Copilot  |  Teacher assessment report  |  {ctx.get('teacher') or ''}")
        canv.setFillColor(C(GREEN)); canv.drawRightString(A4[0] - 46, 28, f'Page {d.page}'); canv.restoreState()

    doc.addPageTemplates([PageTemplate(id='p', frames=[Frame(46, 54, W, A4[1] - 94, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=footer)])
    doc.build(story(a, r))
    return buf.getvalue()


def build(aid):
    """(file name, pdf bytes) for a finished assessment. Kept in memory (last 12) so opening or downloading it again is instant."""
    with get_conn() as conn:
        a = conn.execute('select a.*, t.full_name as teacher_name from teacher_assessments a join teachers t on t.id = a.teacher_id where a.id = %s', (aid,)).fetchone()
    if not a: raise LookupError('Assessment not found.')
    if a['status'] != 'reported' or not a['report']: raise LookupError('The report is not ready yet.')
    r = a['report']; ctx = r.get('context') or {}
    key = (str(aid), r.get('generated_at'))
    pdf = _CACHE.get(key)
    if pdf is None:
        pdf = make_pdf(a, r)
        _CACHE[key] = pdf
        while len(_CACHE) > 12: _CACHE.pop(next(iter(_CACHE)))
    who = ''.join(ch_ if ch_.isalnum() else '_' for ch_ in (ctx.get('teacher') or 'teacher')).strip('_')
    return f"Assessment_report_{who}_{ctx.get('date') or dt.date.today()}.pdf", pdf
