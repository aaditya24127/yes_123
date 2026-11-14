"""The before-visit teaching assessment.

Flow: the CRP asks for it (Visit page, before the visit) -> questions are written in the background (about 60% subject knowledge, 40% teaching method; the last question is
always the same "walk us through" question) -> the teacher is told and answers by voice in the teacher app -> every answer is turned into text (the recording is not kept) and
measured (pace, pauses, filler words, hedging) -> when the last answer is in, a report is written for the CRP and the teacher.

What the AI does: writes the questions and judges the answers against the points a good answer contains. What is measured by plain code (never by the AI): the speaking data and the
confidence indicators. The 60 / 40 weighting of the two scores is applied here.
"""
import datetime as dt, json, re
from statistics import mean

from .. import ai
from ..ai.tasks import FINAL_POINTS, FINAL_QUESTION
from . import push
from .prioritization.data import get_conn

MIN_Q, MAX_Q = 5, 10
KNOWLEDGE_SHARE = 0.6

# Phrases that show a person is not sure (English, Hindi, Marathi, as they come out of the transcript).
HEDGES = ('i think', 'maybe', 'may be', 'probably', 'perhaps', 'not sure', 'i guess', "i don't know", 'i do not know', 'something like', 'kind of', 'sort of',
          'शायद', 'पता नहीं', 'मुझे लगता', 'कदाचित', 'माहित नाही', 'मला वाटतं', 'मला वाटते', 'असावं')
FILLER_WORDS = {'um', 'umm', 'uh', 'uhh', 'uhm', 'er', 'erm', 'ah', 'hmm', 'hm', 'mm'}
FILLER_PHRASES = ('you know', 'i mean', 'matlab', 'म्हणजे', 'मतलब', 'यानी', 'तो फिर')
LONG_PAUSE = 2.0                      # seconds of silence between two stretches of speech that count as a long pause
RATING_SCORE = {'strong': 85, 'some': 60, 'weak': 35, 'not_mentioned': 15, 'good': 85, 'partly': 55, 'poor': 25}


def split(n: int):
    """(knowledge, teaching) question counts for n questions: about 60% / 40%. The teaching count includes the final walkthrough question."""
    k = int(round(KNOWLEDGE_SHARE * n))
    return k, n - k


def board_key(board: str | None) -> str:
    b = (board or '').lower()
    return 'CBSE' if 'cbse' in b else 'ICSE' if 'icse' in b or 'cisce' in b else 'MSBSHSE' if ('maharashtra' in b or 'ssc' in b or 'state' in b) else (board or '')


def _iso(x): return x.isoformat() if hasattr(x, 'isoformat') else x


def _row(a):
    return {k: (str(v) if k.endswith('_id') or k == 'id' else _iso(v)) for k, v in a.items()}


# ------------------------------------------------------------------------------------------------ the CRP asks
def create(conn, *, teacher_id, class_no, subject, chapter, count, ai_choice='auto', requested_by=None):
    if not MIN_Q <= int(count) <= MAX_Q: raise ValueError(f'Choose between {MIN_Q} and {MAX_Q} questions.')
    if not (chapter or '').strip(): raise ValueError('Choose the chapter first.')
    if not subject: raise ValueError('Choose the subject first.')
    if ai_choice not in ('auto', 'claude', 'free'): ai_choice = 'auto'
    t = conn.execute('select t.id, t.school_id, s.board, s.medium from teachers t join schools s on s.id = t.school_id where t.id = %s', (teacher_id,)).fetchone()
    if not t: raise ValueError('Teacher not found.')
    busy = conn.execute("select id from teacher_assessments where teacher_id = %s and status in ('preparing', 'ready', 'in_progress', 'submitted') and requested_at > now() - interval '3 days' limit 1", (teacher_id,)).fetchone()
    if busy: raise ValueError('This teacher already has an assessment waiting. Cancel it first, or wait for the report.')
    a = conn.execute("""insert into teacher_assessments (school_id, teacher_id, requested_by, board, medium, class_no, subject, chapter, question_count, ai_choice)
                        values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *""",
                     (t['school_id'], teacher_id, requested_by, t['board'], t['medium'], class_no or None, subject, chapter.strip(), int(count), ai_choice)).fetchone()
    from ..jobs import enqueue
    enqueue('assessment_questions', {'assessment_id': str(a['id'])}, conn=conn)
    conn.commit()
    return a


def _plain(text):
    """A question as plain text for the voice: some models write non-breaking spaces and hyphens (6 cm, right‑angled), which a voice can misread."""
    for a, b in (('\u202f', ' '), ('\u00a0', ' '), ('\u2009', ' '), ('\u2011', '-'), ('\u2010', '-'), ('\u2013', '-'), ('\u2019', "'"), ('\u2018', "'")):
        text = text.replace(a, b)
    return re.sub(r'\s+', ' ', text).strip()


def _fit_questions(raw, k, t_gen, ctx):
    """Exactly k knowledge + t_gen teaching questions from what the AI wrote (a missing one is made by the free rules), then the fixed last question."""
    know = [q for q in raw if q.get('kind') == 'knowledge'][:k]
    teach = [q for q in raw if q.get('kind') == 'teaching'][:t_gen]
    if len(know) < k or len(teach) < t_gen:
        extra = ai.registry.provider('rules').run(ai.registry.TASKS['assessment_questions'], dict(ctx, knowledge=k, teaching=t_gen), [])[0]['questions']
        have = {q['question'] for q in know + teach}
        for q in extra:
            if q['question'] in have: continue
            if q['kind'] == 'knowledge' and len(know) < k: know.append(q)
            elif q['kind'] == 'teaching' and len(teach) < t_gen: teach.append(q)
    qs = know + teach + [dict(kind='teaching', question=FINAL_QUESTION, expected_points=FINAL_POINTS, common_mistakes=[])]
    return [dict(n=i, kind=q['kind'], question=_plain(q['question']), expected_points=list(q.get('expected_points') or [])[:6], common_mistakes=list(q.get('common_mistakes') or [])[:4])
            for i, q in enumerate(qs, 1)]


def generate_questions(aid):
    """Background job: write the questions, mark the assessment ready, tell the teacher."""
    with get_conn() as conn:
        a = conn.execute('select * from teacher_assessments where id = %s', (aid,)).fetchone()
    if not a or a['status'] != 'preparing': return None
    k, t = split(a['question_count'])
    ctx = dict(board=board_key(a['board']), medium=a['medium'], class_no=a['class_no'], subject=a['subject'], chapter=a['chapter'])
    try:
        r = ai.run('assessment_questions', dict(ctx, count=a['question_count'] - 1, knowledge=k, teaching=t - 1), mode=a['ai_choice'])
        qs, by = _fit_questions(r.data['questions'], k, t - 1, ctx), f'{r.provider} ({r.model or "rules"})'
    except ai.registry.AIUnavailable:
        qs, by = _fit_questions([], k, t - 1, ctx), 'rules'
    with get_conn() as conn:
        conn.execute("update teacher_assessments set questions = %s, questions_by = %s, status = 'ready', ready_at = now() where id = %s and status = 'preparing'", (json.dumps(qs), by, aid))
        who = conn.execute('select full_name from teachers where id = %s', (a['teacher_id'],)).fetchone()
        conn.execute("insert into notifications (recipient_type, teacher_id, title, body, link) values ('teacher', %s, %s, %s, %s)",
                     (a['teacher_id'], 'Your mentor asked for a short assessment',
                      f"{a['subject']}, Class {a['class_no'] or ''}: {a['chapter']}. Open the app and tap Start assessment."[:300], f'/assessment?id={aid}'))
        conn.execute("insert into notifications (recipient_type, title, body, link) values ('crp', %s, %s, '/visit')", ('Assessment sent', f"{who['full_name'] if who else 'The teacher'} has been asked to start it."))
        conn.commit()
    push.notify_teacher(a['teacher_id'], 'Your mentor asked for a short assessment', f"{a['subject']}: {a['chapter']}. Tap to start.", f'/assessment?id={aid}')
    return by


# ------------------------------------------------------------------------------------------------ the teacher answers
def analyse(text: str, segments=None, seconds=None):
    """Speaking data from the transcript and (for voice answers) the timing of its stretches of speech."""
    text = (text or '').strip()
    low = text.lower()
    toks = re.findall(r"[\w'’]+", low, re.U)
    words = len(toks)
    hedges = sum(low.count(h) for h in HEDGES)
    fillers = sum(1 for w in toks if w in FILLER_WORDS) + sum(low.count(p) for p in FILLER_PHRASES)
    out = dict(words=words, hedges=hedges, fillers=fillers, pauses=0, longest_pause=0.0, wpm=None, seconds=seconds)
    segs = sorted((s for s in (segments or []) if s.get('end') is not None), key=lambda s: s['start'])
    if segs:
        gaps = [segs[i + 1]['start'] - segs[i]['end'] for i in range(len(segs) - 1)]
        speech = max(1.0, segs[-1]['end'] - segs[0]['start'])
        out.update(pauses=sum(1 for g in gaps if g >= LONG_PAUSE), longest_pause=round(max(gaps + [0.0]), 1), seconds=round(segs[-1]['end'], 1),
                   wpm=int(round(words / (speech / 60.0))) if words >= 8 else None, lead=round(segs[0]['start'], 1))
    return out


def confidence(st, source='voice'):
    """An indicator (not a measurement) of how sure the answer sounded, from signals only: hedging, filler words, long pauses, very short answers, pace."""
    if st['words'] == 0: return dict(score=0, band='low', signals=['No answer was given'])
    if source != 'voice': return dict(score=None, band='not_measured', signals=['Typed answer: speaking signals are not available'])
    score, sig = 85, []
    if st['hedges']: score -= min(25, 8 * st['hedges']); sig.append(f"{st['hedges']} hedging phrase{'s' if st['hedges'] != 1 else ''} (such as 'I think' or 'maybe')")
    if st['fillers']: score -= min(15, round(st['fillers'] / max(1, st['words']) * 300)); sig.append(f"{st['fillers']} filler word{'s' if st['fillers'] != 1 else ''}")
    if st['pauses']: score -= min(20, 5 * st['pauses']); sig.append(f"{st['pauses']} long pause{'s' if st['pauses'] != 1 else ''} (over {LONG_PAUSE:.0f} seconds)")
    if st['words'] < 15: score -= 15; sig.append('A very short answer')
    if st['wpm'] and st['wpm'] < 70: score -= 8; sig.append('Slow pace')
    if st['wpm'] and st['wpm'] > 190: score -= 5; sig.append('Very fast pace')
    if not sig: sig.append('Steady voice, no signs of hesitation')
    score = max(0, min(100, score))
    return dict(score=score, band='high' if score >= 75 else 'medium' if score >= 50 else 'low', signals=sig)


def add_answer(aid, teacher_id, n, text, source, segments=None, seconds=None):
    """Keep one answer (text and speaking data only). Re-answering a question replaces the earlier answer."""
    with get_conn() as conn:
        a = conn.execute('select * from teacher_assessments where id = %s and teacher_id = %s', (aid, teacher_id)).fetchone()
        if not a: raise LookupError('Assessment not found.')
        if a['status'] not in ('ready', 'in_progress'): raise ValueError('This assessment is not open for answers.')
        if not any(q['n'] == n for q in a['questions']): raise ValueError('That question does not exist.')
        st = analyse(text, segments, seconds)
        row = dict(n=n, text=text.strip(), source=source, **st)
        answers = [x for x in a['answers'] if x['n'] != n] + [row]
        conn.execute("update teacher_assessments set answers = %s, status = 'in_progress', started_at = coalesce(started_at, now()) where id = %s", (json.dumps(sorted(answers, key=lambda x: x['n'])), aid))
        conn.commit()
    return row


# ------------------------------------------------------------------------------------------------ the report
def _scores(questions, answers, ai_q):
    by_n = {x['n']: x for x in ai_q}
    know, teach = [], []
    for q in questions:
        a = next((x for x in answers if x['n'] == q['n']), None)
        s = int(by_n.get(q['n'], {}).get('score', 0)) if a and a['words'] else 0
        (know if q['kind'] == 'knowledge' else teach).append(max(0, min(100, s)))
    K = round(mean(know)) if know else None
    T = round(mean(teach)) if teach else None
    parts = [(K, KNOWLEDGE_SHARE), (T, 1 - KNOWLEDGE_SHARE)]
    have = [(v, w) for v, w in parts if v is not None]
    O = round(sum(v * w for v, w in have) / sum(w for _, w in have)) if have else None
    return K, T, O


def generate_report(aid):
    """Background job: judge the answers, add the measured speaking data and the confidence indicators, save the report and tell the CRP and the teacher."""
    with get_conn() as conn:
        a = conn.execute('select a.*, t.full_name, t.title, s.name as school_name from teacher_assessments a join teachers t on t.id = a.teacher_id join schools s on s.id = a.school_id where a.id = %s', (aid,)).fetchone()
    if not a or a['status'] not in ('submitted', 'in_progress'): return None
    qs, answers = a['questions'], a['answers']
    inp = dict(context=dict(board=board_key(a['board']), class_no=a['class_no'], subject=a['subject'], chapter=a['chapter'], medium=a['medium']),
               questions=[dict(n=q['n'], kind=q['kind'], question=q['question'], expected_points=q['expected_points'], common_mistakes=q['common_mistakes'],
                               answer=(next((x['text'] for x in answers if x['n'] == q['n']), '') or ''),
                               speaking={k: next((x for x in answers if x['n'] == q['n']), {}).get(k) for k in ('seconds', 'words', 'wpm', 'pauses')}) for q in qs])
    r = ai.run('assessment_report', inp, mode=a['ai_choice'])
    d = r.data
    ai_q = d.get('questions') or []
    K, T, O = _scores(qs, answers, ai_q)
    per_q, conf_scores = [], []
    for q in qs:
        x = next((y for y in answers if y['n'] == q['n']), None)
        ai_ = next((y for y in ai_q if y['n'] == q['n']), {})
        conf = confidence(x, x['source']) if x else dict(score=0, band='low', signals=['No answer was given'])
        if conf['score'] is not None and x: conf_scores.append(conf['score'])
        per_q.append(dict(n=q['n'], kind=q['kind'], question=q['question'], score=(max(0, min(100, int(ai_.get('score', 0)))) if x and x['words'] else 0), said=ai_.get('said') or (x['text'][:200] if x else 'No answer was recorded.'),
                          covered=ai_.get('covered') or [], missing=ai_.get('missing') or [], comment=ai_.get('comment') or '', confidence=conf,
                          speaking={k: x.get(k) for k in ('seconds', 'words', 'wpm', 'pauses', 'longest_pause', 'fillers', 'hedges', 'source')} if x else None))
    voiced = [x for x in answers if x['source'] == 'voice' and x['words']]
    speaking = dict(avg_wpm=int(round(mean([x['wpm'] for x in voiced if x['wpm']]))) if any(x['wpm'] for x in voiced) else None,
                    pauses=sum(x['pauses'] for x in voiced), longest_pause=max([x['longest_pause'] for x in voiced] + [0]), fillers=sum(x['fillers'] for x in voiced),
                    hedges=sum(x['hedges'] for x in answers), total_seconds=round(sum(x['seconds'] or 0 for x in voiced)))
    answered = [x for x in answers if x['words']]
    avg_words = round(mean([x['words'] for x in answered])) if answered else 0
    rel = 'good' if len(answered) == len(qs) and len(voiced) == len(answered) and avg_words >= 25 else 'fair' if len(answered) >= max(1, len(qs) - 2) else 'low'
    quality = dict(answered=len(answered), total=len(qs), by_voice=len(voiced), typed=len(answered) - len(voiced), avg_words=avg_words, reliability=rel,
                   note={'good': 'Every question was answered by voice and the answers are long enough to judge.', 'fair': 'Most questions were answered; some answers are short or were typed, so the scores are less certain.',
                         'low': 'Several questions were not answered or the answers are very short. Treat the scores as a rough guide only.'}[rel])
    conf_avg = round(mean(conf_scores)) if conf_scores else None
    dims = [('Topic knowledge', K), ('Teaching method', T), ('Checking understanding', RATING_SCORE[d['checking_understanding']['rating']]), ('Support for weaker students', RATING_SCORE[d['weaker_students']['rating']]),
            ('Fit with board and class', RATING_SCORE[d['board_class_fit']['rating']]), ('Confidence (indicator)', conf_avg)]
    report = dict(version=1, generated_at=dt.datetime.now().isoformat(timespec='seconds'), ai=dict(provider=r.provider, model=r.model),
                  context=dict(teacher=f"{a['title'] or ''} {a['full_name']}".strip(), school=a['school_name'], board=board_key(a['board']), medium=a['medium'], class_no=a['class_no'], subject=a['subject'],
                               chapter=a['chapter'], count=len(qs), requested_by=a['requested_by'], date=str(a['requested_at'].date())),
                  scores=dict(knowledge=K, teaching=T, overall=O, confidence=conf_avg), dims=[dict(label=l, value=v) for l, v in dims if v is not None],
                  questions=per_q, speaking=speaking, data_quality=quality,
                  **{k: d.get(k) for k in ('summary', 'strengths', 'changes', 'better_methods', 'do', 'dont', 'misconceptions', 'tools', 'checking_understanding', 'weaker_students', 'board_class_fit', 'visit_focus')})
    with get_conn() as conn:
        conn.execute("update teacher_assessments set report = %s, report_by = %s, status = 'reported', reported_at = now(), error = null where id = %s",
                     (json.dumps(report), f'{r.provider} ({r.model or "rules"})', aid))
        conn.execute("insert into notifications (recipient_type, title, body, link) values ('crp', %s, %s, '/visit')", (f"Assessment report ready: {report['context']['teacher']}", f"{a['subject']}, Class {a['class_no'] or ''}: {a['chapter']}"[:200]))
        conn.execute("insert into notifications (recipient_type, teacher_id, title, body, link) values ('teacher', %s, 'Your assessment report is ready', 'Open the app to read it.', %s)", (a['teacher_id'], f'/assessment?id={aid}'))
        conn.commit()
    push.notify_teacher(a['teacher_id'], 'Your assessment report is ready', 'Open the app to read it.', f'/assessment?id={aid}')
    return r.provider


# ------------------------------------------------------------------------------------------------ what each side may see
def teacher_view(a):
    """The teacher sees the question texts only: never the expected points, and not the kind of question."""
    answered = {x['n']: x for x in a['answers']}
    return dict(id=str(a['id']), status=a['status'], subject=a['subject'], class_no=a['class_no'], chapter=a['chapter'], count=a['question_count'], requested_by=a['requested_by'],
                requested_at=_iso(a['requested_at']), questions=[dict(n=q['n'], question=q['question'], answered=q['n'] in answered and bool(answered[q['n']]['words']), last=q['n'] == len(a['questions'])) for q in a['questions']],
                report=report_for_teacher(a['report']) if a['status'] == 'reported' else None, error=a.get('error'))


def report_for_teacher(rep):
    return {k: v for k, v in rep.items()}                # the report is for the CRP and the teacher alike (expected points are not part of it)


def crp_view(a, full=False):
    d = dict(id=str(a['id']), teacher_id=str(a['teacher_id']), status=a['status'], subject=a['subject'], class_no=a['class_no'], chapter=a['chapter'], count=a['question_count'], ai_choice=a['ai_choice'],
             requested_by=a['requested_by'], requested_at=_iso(a['requested_at']), ready_at=_iso(a['ready_at']), started_at=_iso(a['started_at']), submitted_at=_iso(a['submitted_at']),
             reported_at=_iso(a['reported_at']), answered=sum(1 for x in a['answers'] if x['words']), questions_by=a['questions_by'], report_by=a['report_by'], error=a.get('error'),
             teacher_name=a.get('teacher_name'), scores=(a['report'] or {}).get('scores'))
    if full: d.update(questions=a['questions'], report=a['report'] or None)
    return d


def latest_for_brief(conn, teacher_id):
    """The newest finished assessment of this teacher (last 120 days): what the Visit brief shows to the CRP."""
    a = conn.execute("select id, class_no, subject, chapter, report, reported_at from teacher_assessments where teacher_id = %s and status = 'reported' and reported_at > now() - interval '120 days' order by reported_at desc limit 1", (teacher_id,)).fetchone()
    if not a: return None
    r = a['report'] or {}
    return dict(id=str(a['id']), date=str(a['reported_at'].date()), subject=a['subject'], class_no=a['class_no'], chapter=a['chapter'], scores=r.get('scores'), focus=(r.get('visit_focus') or [])[:5],
                reliability=(r.get('data_quality') or {}).get('reliability'))
