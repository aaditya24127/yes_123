"""Directory lists for pickers, "Ask the copilot" over the latest data, and AI settings / usage."""
import datetime as dt
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import ai
from ..services.prioritization.data import get_conn

router = APIRouter(prefix='/api', tags=['assistant'])


@router.get('/directory')
def directory():
    with get_conn() as conn:
        schools = conn.execute('select id, code, name, board, medium, grade_from, grade_to, village from schools where is_active order by code').fetchall()
        teachers = conn.execute('select id, school_id, teacher_code, title, full_name, designation, classes_taught, subjects_taught, phone from teachers where is_active order by teacher_code').fetchall()
    return dict(schools=[dict(s, id=str(s['id'])) for s in schools],
                teachers=[dict(t, id=str(t['id']), school_id=str(t['school_id']), name=f"{t['title'] or ''} {t['full_name']}".strip()) for t in teachers])


class PhoneReq(BaseModel):
    phone: str | None = None


@router.patch('/teachers/{tid}/phone')
def set_teacher_phone(tid: str, req: PhoneReq):
    """The teacher's WhatsApp number (10 digits; the country code 91 is added). An empty value removes it."""
    from ..services import whatsapp
    raw = (req.phone or '').strip()
    phone = whatsapp.normalize(raw) if raw else None
    if raw and not phone: raise HTTPException(400, 'That does not look like a phone number. Please type 10 digits.')
    with get_conn() as conn:
        if not conn.execute('select 1 from teachers where id = %s', (tid,)).fetchone(): raise HTTPException(404, 'Teacher not found.')
        conn.execute('update teachers set phone = %s where id = %s', (phone, tid)); conn.commit()
    return dict(phone=phone)


@router.get('/curriculum')
def curriculum_chapters(school_id: str | None = None, class_no: int | None = None, subject: str | None = None):
    """Chapter lists for the school's board and medium, class and subject (the chapter dropdown). `note` says when the list is a nearest match."""
    from ..services import curriculum
    board = medium = None
    if school_id:
        with get_conn() as conn:
            s = conn.execute('select board, medium from schools where id = %s', (school_id,)).fetchone()
        if s: board, medium = s['board'], s['medium']
    return curriculum.lookup(board, medium, class_no, subject)


def records_text(school_id=None, teacher_id=None, limit=400):
    """The latest records as short lines (what the copilot reads). Includes everything imported so far."""
    w, p = [], []
    if teacher_id: w.append('teacher_id = %s'); p.append(teacher_id)
    elif school_id: w.append('school_id = %s'); p.append(school_id)
    where = ('where ' + ' and '.join(w)) if w else ''
    with get_conn() as conn:
        sch = {r['id']: r['code'] for r in conn.execute('select id, code from schools').fetchall()}
        tch = {r['id']: r['full_name'] for r in conn.execute('select id, full_name from teachers').fetchall()}
        lines = []
        for a in conn.execute(f"select * from assessments {where} {'and' if where else 'where'} validation_status = 'valid' order by assessment_date desc limit %s", (*p, limit)).fetchall():
            lines.append(f"assessment {sch[a['school_id']]} Class {a['class_no']} {a['subject']} {a['assessment_date']}: {a['students_below']}/{a['students_assessed']} below benchmark"
                         + (f" (teacher {tch.get(a['teacher_id'])})" if a['teacher_id'] else ''))
        for o in conn.execute(f"select * from observations {where} {'and' if where else 'where'} validation_status = 'valid' order by observation_date desc limit %s", (*p, limit)).fetchall():
            lines.append(f"observation {sch[o['school_id']]} {o['observation_date']} {tch.get(o['teacher_id'], '')}: {o['need_code']} {o['severity']} {o['status']}: {o['issue_text']}")
        for f in conn.execute(f"select f.*, i.approved_action from follow_ups f left join interventions i on i.id = f.intervention_id {where.replace('school_id', 'f.school_id').replace('teacher_id', 'f.teacher_id')} order by due_date desc limit %s", (*p, limit)).fetchall():
            lines.append(f"follow-up {sch[f['school_id']]} due {f['due_date']} {f['status']}: {f['approved_action']}")
        for v in conn.execute(f"select * from visits {where} order by visit_date desc limit %s", (*p, 100)).fetchall():
            lines.append(f"visit {sch[v['school_id']]} {v['visit_date']} {v['visit_type']} {tch.get(v['teacher_id'], '')}")
        if not teacher_id:
            for a in conn.execute(f"select * from attendance {where} order by month desc limit 60", p).fetchall():
                lines.append(f"attendance {sch[a['school_id']]} {a['month']}: {a['avg_attendance_pct']}% (target {a['target_pct']}%)")
            for f in conn.execute(f"select * from facts {where} order by as_of_date desc limit 100", p).fetchall():
                lines.append(f"fact {sch[f['school_id']]} {f['fact_key']} = {f['value_num'] if f['value_num'] is not None else f['value_text']} ({f['as_of_date']})")
        for s in conn.execute(f"select started_at, result from visit_sessions {where} {'and' if where else 'where'} status in ('evaluated','saved') order by started_at desc limit 10", p).fetchall():
            lines.append(f"visit evaluation {s['started_at']:%Y-%m-%d}: {(s['result'] or {}).get('overall', '')}")
    return '\n'.join(lines)


class AskReq(BaseModel):
    question: str
    school_id: str | None = None
    teacher_id: str | None = None


@router.post('/ask')
def ask(req: AskReq):
    if not req.question.strip(): raise HTTPException(400, 'please type a question')
    recs = records_text(req.school_id, req.teacher_id)
    try:
        r = ai.run('ask_copilot', dict(question=req.question.strip(), records=recs[:120000], today=str(dt.date.today())))
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    return dict(r.data, answered_by=r.provider)


@router.get('/ai/status')
def ai_status():
    return ai.status()


@router.post('/ai/test')
def ai_test():
    """Free checks of every AI key / service (no credit spent)."""
    return ai.test_all()


# One row per API key: which of the providers in config/ai.json use it (the key itself is never sent anywhere).
KEY_GROUPS = [
    ('claude', 'Claude (Anthropic)', 'ANTHROPIC_API_KEY', 'Paid. Reads files, writes briefs and evaluates lessons.', 'paid'),
    ('gemini', 'Gemini (Google)', 'GEMINI_API_KEY', 'Free plan. Used as a first, free reader of files.', 'free'),
    ('groq', 'Groq (voice to text)', 'GROQ_API_KEY', 'Free plan. Turns recordings into text.', 'free'),
]


def _by_key(days: int):
    with get_conn() as conn:
        rows = conn.execute("""select provider, count(*) as calls, count(*) filter (where not ok) as failed, coalesce(sum(input_tokens),0) as tin, coalesce(sum(output_tokens),0) as tout,
                               coalesce(sum(cost_usd),0) as cost, count(*) filter (where created_at > now() - make_interval(days => %s)) as calls_recent,
                               coalesce(sum(cost_usd) filter (where created_at > now() - make_interval(days => %s)),0) as cost_recent
                               from llm_calls group by 1""", (days, days)).fetchall()
    out = []
    for prefix, label, env, note, plan in KEY_GROUPS:
        mine = [r for r in rows if r['provider'].startswith(prefix)]
        s = lambda k: sum(float(r[k] or 0) for r in mine)
        out.append(dict(id=prefix, label=label, env=env, note=note, plan=plan, key_set=bool((os.environ.get(env) or '').strip()),
                        calls=int(s('calls')), failed=int(s('failed')), tokens_in=int(s('tin')), tokens_out=int(s('tout')), cost_usd=s('cost'),
                        calls_recent=int(s('calls_recent')), cost_recent_usd=s('cost_recent')))
    return out


@router.get('/ai/usage')
def ai_usage(days: int = 30):
    with get_conn() as conn:
        tot = conn.execute("select coalesce(sum(cost_usd),0) as cost, count(*) as calls, count(*) filter (where not ok) as failed from llm_calls where created_at > now() - make_interval(days => %s)", (days,)).fetchone()
        alltime = conn.execute('select coalesce(sum(cost_usd),0) as cost, count(*) as calls from llm_calls').fetchone()
        by = conn.execute("""select task, provider, model, count(*) as calls, sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens, sum(cost_usd) as cost,
                             count(*) filter (where not ok) as failed from llm_calls where created_at > now() - make_interval(days => %s) group by 1,2,3 order by cost desc, calls desc""", (days,)).fetchall()
    f = lambda x: float(x or 0)
    keys = _by_key(days)
    cap = (os.environ.get('AI_BUDGET_USD') or '').strip()
    try: budget = float(cap) if cap else None
    except ValueError: budget = None
    return dict(days=days, cost_usd=f(tot['cost']), calls=tot['calls'], failed=tot['failed'], all_time_cost_usd=f(alltime['cost']), all_time_calls=alltime['calls'], budget_usd=budget, by_key=keys,
                by_task=[dict(r, cost=f(r['cost'])) for r in by])
