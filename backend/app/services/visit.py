"""The 4-step visit: 1 brief -> 2 class (recording + notes) -> 3 student questions and answers -> 4 evaluation and saving.

All data comes fresh from the database on every call, so anything uploaded or imported a minute ago is included.
"""
import datetime as dt, json

from .. import ai
from .prioritization import engine
from .prioritization.data import Data, get_conn
from .prioritization.factors import _open_threads
from .prioritization.scorers import NEED_LABEL


def _who(t, s): return f"{t['title'] or ''} {t['full_name']}".strip() + f" ({t['designation']}, {s['name']})" if t else s['name']


def gather(teacher_id=None, school_id=None, as_of=None):
    """Everything the CRP should see before the visit, as plain data (also the input for the AI brief and evaluation)."""
    as_of = as_of or dt.date.today()
    with get_conn() as conn:
        d = Data(conn)
        t = d.teacher_by_id.get(_uuid(teacher_id)) if teacher_id else None
        s = d.school_by_id.get(t['school_id'] if t else _uuid(school_id))
        if not s: raise ValueError('school or teacher not found')
        entity = 'teacher' if t else 'school'
        res = engine.run(d, as_of, entity)
        item = next((i for i in res['items'] if i['id'] == str((t or s)['id'])), None)
        ctx = next(c for c in engine.make_contexts(d, as_of, entity) if (c.teacher or c.school)['id'] == (t or s)['id'])
        issues = []
        for k, (first, last) in enumerate(_open_threads(ctx), 1):
            issues.append(dict(ref=f'O{k}', label=NEED_LABEL.get(last['need_code'], last['need_code']), issue=f"[O{k}] {NEED_LABEL.get(last['need_code'], last['need_code'])} ({last['severity']}): {last['issue_text']}",
                               need_code=last['need_code'], severity=last['severity'], teacher_id=str(last['teacher_id']) if last['teacher_id'] else None,
                               class_label=last['class_label'], subject=last['subject'], since=str(first['observation_date']), last_seen=str(last['observation_date'])))
        good = [dict(point=o['issue_text'], date=str(o['observation_date']), subject=o['subject'], class_label=o['class_label']) for o in ctx.observations
                if o['need_code'] == 'GOOD_PRACTICE' and o['validation_status'] == 'valid'][-8:]
        actions = []
        for f in ctx.follow_ups:
            if f['status'] == 'open':
                actions.append(dict(action=f['action'] or 'agreed action', due=str(f['due_date']), overdue_days=max(0, (as_of - f['due_date']).days), responsible=f['responsible']))
        latest = {}
        for a in sorted([a for a in ctx.assessments if a['validation_status'] == 'valid' and a['students_assessed']], key=lambda a: a['assessment_date']):
            latest[(a['class_no'], a['subject'])] = a
        results = [dict(cls=a['class_no'], subject=a['subject'], skill=a['skill'], below_pct=round(100 * a['students_below'] / a['students_assessed']),
                        date=str(a['assessment_date']), exam=a['exam_type']) for a in latest.values()]
        visits = sorted(ctx.visits, key=lambda v: v['visit_date'])
        sess = conn.execute("""select id, started_at, class_no, subject, topic, result from visit_sessions where status in ('evaluated', 'saved') and
                               (teacher_id = %s or (%s::uuid is null and school_id = %s)) order by started_at desc limit 8""",
                            (t['id'] if t else None, t['id'] if t else None, s['id'])).fetchall()
        prev = [dict(date=str(x['started_at'].date()), cls=x['class_no'], subject=x['subject'], topic=x['topic'], overall=(x['result'] or {}).get('overall'),
                     next_steps=[n['action'] for n in (x['result'] or {}).get('next_steps', [])]) for x in sess]
        books = conn.execute("select title, class_no, subject, source_url, contents from teaching_resources where school_id = %s and (teacher_id = %s or teacher_id is null) order by created_at desc",
                             (s['id'], t['id'] if t else None)).fetchall()
        acc = conn.execute('select email from teacher_accounts where teacher_id = %s', (t['id'],)).fetchone() if t else None
        email = acc['email'] if acc else None
        reqs = conn.execute("select title, kind, status, due_date from teacher_requests where school_id = %s and (teacher_id = %s or %s::uuid is null) and status in ('open','submitted') order by created_at desc",
                            (s['id'], t['id'] if t else None, t['id'] if t else None)).fetchall()
    return dict(
        who=_who(t, s), entity=entity, school=dict(id=str(s['id']), code=s['code'], name=s['name'], type=s['school_type'], board=s['board'], medium=s['medium'],
                                                    grades=f"{s['grade_from']}-{s['grade_to']}", village=s['village']),
        teacher=None if not t else dict(id=str(t['id']), name=f"{t['title'] or ''} {t['full_name']}".strip(), designation=t['designation'], classes=t['classes_taught'],
                                        subjects=t['subjects_taught'], joined=str(t['joined_date']) if t['joined_date'] else None, email=email),
        scores=None if not item else dict(score=item['score'], band=item['band'], rank=item['rank'], flags=[f['label'] for f in item['flags']],
                                          categories=[dict(label=c['label'], score=c['score'], contribution=c['contribution'], explanation=c['explanation']) for c in item['categories']]),
        alerts=[a['message'] for a in (item or {}).get('alerts', [])], open_issues=issues, strengths_seen=good, open_actions=actions,
        overdue=[a for a in actions if a['overdue_days'] > 0], latest_results=results[:30],
        last_visit=str(visits[-1]['visit_date']) if visits else None, visit_count=len(visits), previous_sessions=prev,
        textbooks=[dict(title=b['title'], cls=b['class_no'], subject=b['subject'], url=b['source_url'], chapters=(b['contents'] or [])[:30]) for b in books],
        pending_requests=[dict(title=r['title'], kind=r['kind'], status=r['status'], due=str(r['due_date']) if r['due_date'] else None) for r in reqs])


def brief(teacher_id=None, school_id=None, fast=False):
    """The before-class briefing. fast=True answers at once with the plain summary built from the records (no waiting for an AI);
    the screen then asks again without fast to swap in the sharper AI version."""
    data = gather(teacher_id, school_id)
    if fast:
        from ..ai.providers.rules import RulesProvider
        data['brief'], data['brief_by'] = RulesProvider('rules', {}).visit_brief(data), 'rules'
        return data
    try:
        r = ai.run('visit_brief', data)
        data['brief'], data['brief_by'] = r.data, r.provider
    except ai.AIUnavailable:
        data['brief'], data['brief_by'] = None, None
    return data


def _uuid(x):
    import uuid
    return uuid.UUID(str(x)) if x else None


# ---------------------------------------------------------------- step 3 and 4 inputs
def session_input(s, media):
    lesson = [m for m in media if m['kind'] == 'lesson_audio' and m['transcript']]
    answers = []
    qs = s['questions'] or []
    for m in media:
        if m['kind'] == 'student_answer':
            q = qs[m['question_index']] if m['question_index'] is not None and m['question_index'] < len(qs) else {}
            answers.append(dict(question=q.get('question', ''), good_answer=q.get('good_answer', ''), watch_for=q.get('watch_for', ''),
                                student=m['student_label'], answer=m['transcript'] or '(not transcribed)'))
    brief_ = s['brief'] or {}
    book = next((b for b in brief_.get('textbooks', []) if (not s['class_no'] or b.get('cls') in (None, s['class_no']))), None)
    return dict(school=brief_.get('school'), teacher=brief_.get('teacher'), class_no=s['class_no'], subject=s['subject'], topic=s['topic'],
                language=(brief_.get('school') or {}).get('medium'), crp_notes=s['crp_notes'] or '', changes_since_last=s['changes_since_last'] or '',
                lesson_transcript='\n\n'.join(m['transcript'] for m in lesson)[:40000], student_answers=answers,
                open_issues=brief_.get('open_issues', []), open_actions=brief_.get('open_actions', []), previous_sessions=brief_.get('previous_sessions', []),
                latest_results=brief_.get('latest_results', []), textbook=book)


def load_session(conn, sid):
    s = conn.execute('select * from visit_sessions where id = %s', (sid,)).fetchone()
    if not s: raise ValueError('visit not found')
    media = conn.execute("""select m.*, f.original_filename, f.duration_seconds from session_media m left join source_files f on f.id = m.source_file_id
                            where m.session_id = %s order by m.created_at""", (sid,)).fetchall()
    return s, media


def evaluate(sid):
    """Job handler body: make sure every recording is transcribed, then run the evaluation."""
    from .ingest.pipeline import transcribe
    from ..core.storage import get_storage
    st = get_storage()
    with get_conn() as conn:
        s, media = load_session(conn, sid)
        for m in media:
            if m['source_file_id'] and not m['transcript'] and m['kind'] in ('lesson_audio', 'student_answer'):
                f = conn.execute('select storage_path, original_filename from source_files where id = %s', (m['source_file_id'],)).fetchone()
                tr, note = transcribe(st.get(f['storage_path']), f['original_filename'])
                if tr:
                    text = '\n'.join(f"[{int(x['start'] // 60):02d}:{int(x['start'] % 60):02d}] {x['text']}" for x in tr['segments']) or tr['text']
                    conn.execute('update session_media set transcript = %s, transcript_by = %s where id = %s', (text, tr['by'], m['id']))
                    conn.execute('update source_files set extracted_text = %s where id = %s', (text, m['source_file_id']))
        conn.commit()
        s, media = load_session(conn, sid)
    inp = session_input(s, media)
    r = ai.run('evaluate_lesson', inp)
    result = dict(r.data, evaluated_by=r.provider, evaluated_at=dt.datetime.now().isoformat(timespec='seconds'))
    with get_conn() as conn:
        conn.execute("update visit_sessions set result = %s, status = 'evaluated', stage = 4, evaluated_at = now() where id = %s", (json.dumps(result), sid))
        conn.execute("insert into notifications (recipient_type, title, body, link) values ('crp', 'Visit evaluation ready', %s, %s)",
                     ((s['brief'] or {}).get('who', ''), f'/visit?session={sid}'))
        conn.commit()
    return r.provider


def save_to_records(sid, approved_growth=None, approved_steps=None):
    """CRP approves the evaluation: it becomes a visit, observations, agreed actions with due dates, and resolved earlier issues.
    From then on it counts in the ranking like any uploaded report."""
    with get_conn() as conn:
        s, media = load_session(conn, sid)
        if s['status'] == 'saved': raise ValueError('already saved')
        res = s['result'] or {}
        if not res: raise ValueError('evaluate the visit first')
        today = dt.date.today()
        lesson_file = next((m['source_file_id'] for m in media if m['kind'] == 'lesson_audio' and m['source_file_id']), None)
        vid = conn.execute("""insert into visits (school_id, teacher_id, crp_id, visit_date, visit_type, class_no, subject, source_file_id)
                              values (%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                           (s['school_id'], s['teacher_id'], s['crp_id'], today, 'classroom_observation' if s['teacher_id'] else 'school_visit', s['class_no'], s['subject'],
                            lesson_file)).fetchone()['id']
        growth = res.get('growth', [])
        keep = set(approved_growth) if approved_growth is not None else set(range(len(growth)))
        n_obs = 0
        for k, g in enumerate(growth):
            if k not in keep: continue
            conn.execute("""insert into observations (school_id, teacher_id, visit_id, observation_date, need_code, issue_text, severity, status, class_label, subject,
                            extraction_origin, source_file_id, locator, evidence_text, validation_status) values (%s,%s,%s,%s,%s,%s,%s,'open',%s,%s,'manual',%s,%s,%s,'valid')""",
                         (s['school_id'], s['teacher_id'], vid, today, g.get('need_code', 'CLASS_PARTICIPATION'), g['area'], g.get('severity', 'significant'),
                          f"Class {s['class_no']}" if s['class_no'] else None, s['subject'], lesson_file, 'visit evaluation', g.get('evidence', '')[:500]))
            n_obs += 1
        for st_ in res.get('strengths', [])[:2]:
            conn.execute("""insert into observations (school_id, teacher_id, visit_id, observation_date, need_code, issue_text, severity, status, subject, extraction_origin,
                            source_file_id, locator, evidence_text, validation_status) values (%s,%s,%s,%s,'GOOD_PRACTICE',%s,'none','n/a',%s,'manual',%s,'visit evaluation',%s,'valid')""",
                         (s['school_id'], s['teacher_id'], vid, today, st_['point'], s['subject'], lesson_file, st_.get('evidence', '')[:500]))
        # earlier issues the evaluation found improved are closed with a "resolved" record (the latest record decides an issue's status)
        brief_issues = {i['ref']: i for i in (s['brief'] or {}).get('open_issues', [])}
        n_res = 0
        for c in res.get('compared_with_before', []):
            if c['change'] != 'improved': continue
            ref = c['issue'][1:c['issue'].find(']')] if c['issue'].startswith('[') else None
            i = brief_issues.get(ref)
            if not i: continue
            conn.execute("""insert into observations (school_id, teacher_id, visit_id, observation_date, need_code, issue_text, severity, status, resolved_on, class_label,
                            subject, extraction_origin, locator, evidence_text, validation_status) values (%s,%s,%s,%s,%s,%s,%s,'resolved',%s,%s,%s,'manual','visit evaluation',%s,'valid')""",
                         (s['school_id'], i['teacher_id'] or s['teacher_id'], vid, today, i['need_code'], 'Improved: ' + i['issue'][len(ref) + 3:], i['severity'], today,
                          i['class_label'], i['subject'], c.get('evidence', '')[:500]))
            n_res += 1
        steps = res.get('next_steps', [])
        keep_s = set(approved_steps) if approved_steps is not None else set(range(len(steps)))
        n_act = 0
        for k, a in enumerate(steps):
            if k not in keep_s: continue
            due = today + dt.timedelta(days=int(s.get('followup_days') or 14))
            iid = conn.execute("""insert into interventions (school_id, teacher_id, created_on, recommended_action, approved_action, responsible, planned_completion, status, locator)
                                  values (%s,%s,%s,%s,%s,%s,%s,'approved','visit evaluation') returning id""",
                               (s['school_id'], s['teacher_id'], today, a['action'], a['action'], a.get('who'), due)).fetchone()['id']
            conn.execute("insert into follow_ups (intervention_id, school_id, teacher_id, due_date, status) values (%s,%s,%s,%s,'open')",
                         (iid, s['school_id'], s['teacher_id'], due))
            n_act += 1
        conn.execute("update visit_sessions set status = 'saved', visit_id = %s where id = %s", (vid, sid))
        if s['teacher_id']:
            conn.execute("insert into notifications (recipient_type, teacher_id, title, body, link) values ('teacher', %s, 'Feedback from your CRP visit', %s, null)",
                         (s['teacher_id'], res.get('overall', '')[:400]))
        conn.commit()
    return dict(visit_id=str(vid), observations=n_obs, resolved=n_res, actions=n_act)
