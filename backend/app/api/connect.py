"""CRP <-> teacher: requests (send marks, syllabus plan, a lesson recording...), visit notices, messages, notifications,
so data can come in between visits. The teacher's side (sign in, tasks, uploads, concerns) is in teacher_app.py."""
import datetime as dt

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import push, tasks
from ..services.ingest import pipeline
from ..services.prioritization.data import get_conn

router = APIRouter(prefix='/api', tags=['connect'])

KIND_LABEL = {'marks': 'Student marks / test results', 'syllabus_plan': 'Syllabus / year plan', 'lesson_plan': 'Lesson plan', 'attendance': 'Attendance',
              'lesson_recording': 'Lesson recording', 'student_work': 'Student work samples', 'reflection': 'Self-reflection', 'visit_notice': 'Visit notice', 'other': 'Other'}
KIND_SECTION = {'marks': 'assessments', 'attendance': 'attendance', 'syllabus_plan': 'textbooks', 'lesson_plan': 'textbooks', 'lesson_recording': 'audio',
                'student_work': 'observations', 'reflection': 'observations', 'other': None}


def _iso(x): return x.isoformat() if hasattr(x, 'isoformat') else x


def _row(r): return {k: (str(v) if k.endswith('id') and v is not None else _iso(v)) for k, v in r.items()}


# ---------------------------------------------------------------- CRP side
@router.get('/connect/overview')
def overview():
    with get_conn() as conn:
        rows = conn.execute("""select t.id, t.full_name, t.title, t.designation, s.id as school_id, s.name as school_name, s.code as school_code,
            (select count(*) from teacher_requests r where r.teacher_id = t.id and r.status = 'open') as open_requests,
            (select count(*) from teacher_requests r where r.teacher_id = t.id and r.status = 'submitted') as submitted,
            (select count(*) from messages m where m.teacher_id = t.id and m.sender = 'teacher' and m.read_at is null) as unread,
            (select max(created_at) from messages m where m.teacher_id = t.id) as last_message,
            (select a.email from teacher_accounts a where a.teacher_id = t.id) as email
            from teachers t join schools s on s.id = t.school_id where t.is_active order by s.code, t.full_name""").fetchall()
    return [_row(r) for r in rows]


class ItemIn(BaseModel):
    kind: str = 'other'
    title: str | None = None
    instructions: str | None = None


class RequestReq(BaseModel):
    teacher_ids: list[str] = []
    school_id: str | None = None          # all teachers of this school
    kind: str = 'other'                   # 'visit_notice', or the type of a single task
    title: str | None = None              # the package title ("Before the visit")
    message: str | None = None            # a general message for the whole package
    due_date: dt.date | None = None
    visit_date: dt.date | None = None
    items: list[ItemIn] = []              # numbered tasks; empty = one task made from kind + message


@router.get('/task-options')
def task_options():
    """Task types the CRP can ask for, and where an accepted answer can be added in the records (the website lists these, it never hard-codes them)."""
    return dict(kinds=[dict(code=k, label=v, default_add_to=KIND_SECTION.get(k)) for k, v in KIND_LABEL.items() if k not in ('visit_notice', 'lesson_recording')],      # teachers are not asked for audio
                add_to=[dict(code=k, label=v) for k, v in tasks.ADD_TO])


def _task_body(req, items):
    lines = []
    for n, i in enumerate(items, 1):
        ins = (i.instructions or '').strip()
        lines.append(f"Task {n}: {i.title or KIND_LABEL[i.kind]}" + (f" - {ins}" if ins else ''))
    head = (req.message or '').strip()
    if len(items) == 1 and not head:
        return (items[0].instructions or '').strip() or items[0].title or KIND_LABEL[items[0].kind]
    return (head + '\n' if head else '') + '\n'.join(lines)


@router.post('/requests')
def create_requests(req: RequestReq):
    if req.kind not in KIND_LABEL: raise HTTPException(400, 'unknown request type')
    items = [i for i in req.items if (i.instructions or '').strip() or (i.title or '').strip()]
    if req.kind != 'visit_notice' and not items:
        items = [ItemIn(kind=req.kind, title=req.title, instructions=req.message)]
    for i in items:
        if i.kind not in KIND_LABEL or i.kind == 'visit_notice': raise HTTPException(400, 'unknown task type')
    kinds = {i.kind for i in items}
    kind = 'visit_notice' if req.kind == 'visit_notice' else (kinds.pop() if len(kinds) == 1 else 'other')
    with get_conn() as conn:
        tids = list(req.teacher_ids)
        if req.school_id and not tids:
            tids = [str(r['id']) for r in conn.execute('select id from teachers where school_id = %s and is_active', (req.school_id,)).fetchall()]
        if not tids: raise HTTPException(400, 'choose at least one teacher')
        if kind == 'visit_notice':
            title = req.title or (f"CRP visit on {req.visit_date:%d %b %Y}" if req.visit_date else KIND_LABEL[kind])
        elif len(items) == 1:
            title = req.title or items[0].title or KIND_LABEL[items[0].kind]
        else:
            title = req.title or f"{len(items)} tasks from your CRP"
        ids, pushes = [], []
        for tid in tids:
            t = conn.execute('select school_id from teachers where id = %s', (tid,)).fetchone()
            if not t: continue
            rid = conn.execute("""insert into teacher_requests (school_id, teacher_id, kind, title, message, due_date, visit_date, created_by) values (%s,%s,%s,%s,%s,%s,%s,'crp') returning id""",
                               (t['school_id'], tid, kind, title, req.message, req.due_date, req.visit_date)).fetchone()['id']
            if kind == 'visit_notice':
                body = req.message or title
                if req.visit_date: body = f"Your CRP will visit on {req.visit_date:%A %d %B}. {req.message or 'Please keep your lesson plan, recent marks and attendance ready.'}"
            else:
                body = _task_body(req, items)
                for n, i in enumerate(items, 1):
                    conn.execute('insert into task_items (request_id, position, title, instructions, kind) values (%s,%s,%s,%s,%s)',
                                 (rid, n, (i.title or '').strip() or KIND_LABEL[i.kind], (i.instructions or '').strip() or None, i.kind))
            conn.execute("insert into messages (teacher_id, sender, body, request_id) values (%s,'crp',%s,%s)", (tid, body, rid))
            conn.execute("insert into notifications (recipient_type, teacher_id, title, body) values ('teacher',%s,%s,%s)", (tid, title, body))
            ids.append(str(rid)); pushes.append((tid, title, body[:200], f'/task?id={rid}'))
        conn.commit()
    for p in pushes: push.notify_teacher(*p)
    return dict(created=len(ids), ids=ids)


@router.get('/requests')
def list_requests(teacher_id: str | None = None, status: str | None = None, limit: int = 100):
    with get_conn() as conn:
        rows = conn.execute("""select r.*, t.full_name as teacher_name, s.name as school_name from teacher_requests r join schools s on s.id = r.school_id
                               left join teachers t on t.id = r.teacher_id where (%s::uuid is null or r.teacher_id = %s) and (%s::text is null or r.status = %s)
                               order by r.created_at desc limit %s""", (teacher_id, teacher_id, status, status, limit)).fetchall()
        its = tasks.items_by_request(conn, [r['id'] for r in rows])
    return [dict(_row(r), items=its.get(str(r['id']), [])) for r in rows]


class ReviewReq(BaseModel):
    action: str                           # accept | reject
    remark: str | None = None             # required when rejecting
    add_to: str | None = None             # accepting: a records section from /api/task-options, or none = just accept
    scope: str = 'teacher'                # accepting: 'teacher' = belongs to this teacher, 'school' = to the whole school


@router.post('/task-items/{item_id}/review')
def review_item(item_id: str, req: ReviewReq):
    """Accept (optionally adding the files to the records) or reject (remarks required) a task the teacher has sent."""
    if req.action not in ('accept', 'reject'): raise HTTPException(400, 'action must be accept or reject')
    if req.scope not in ('teacher', 'school'): raise HTTPException(400, 'scope must be teacher or school')
    remark = (req.remark or '').strip()
    if req.action == 'reject' and not remark: raise HTTPException(400, 'Please write remarks so the teacher knows what to fix.')
    if req.add_to and req.add_to not in tasks.ADD_SECTIONS: raise HTTPException(400, 'unknown place to add the files')
    with get_conn() as conn:
        it = conn.execute("""select i.*, r.teacher_id, r.school_id from task_items i join teacher_requests r on r.id = i.request_id where i.id = %s""", (item_id,)).fetchone()
        if not it: raise HTTPException(404, 'task not found')
        if it['status'] != 'submitted': raise HTTPException(400, 'Only a task the teacher has sent can be accepted or rejected.')
        files = conn.execute("""select u.id, u.status, b.id as batch_id from upload_items u join upload_batches b on b.id = u.batch_id where b.task_item_id = %s""", (item_id,)).fetchall()
    label = f"Task {it['position']}"
    queued = skipped = 0
    if req.action == 'accept' and req.add_to:
        batches = []
        for u in files:
            if u['status'] == 'duplicate': skipped += 1; continue
            if u['status'] not in ('sorted', 'needs_attention'): continue
            try:
                pipeline.update_item(str(u['id']), section=req.add_to, school_id=str(it['school_id']),
                                     teacher_id=str(it['teacher_id']) if req.scope == 'teacher' and it['teacher_id'] else None, status='sorted')
            except ValueError as e:
                raise HTTPException(400, str(e))
            if str(u['batch_id']) not in batches: batches.append(str(u['batch_id']))
        for b in batches: queued += pipeline.start_import(b)
    with get_conn() as conn:
        if req.action == 'reject':
            conn.execute("update task_items set status = 'rejected', review_remark = %s, reviewed_at = now() where id = %s", (remark, item_id))
            # this attempt is replaced: its files must not be imported later, only the teacher's next submission
            conn.execute("""update upload_items set status = 'skipped' where status in ('sorted', 'needs_attention', 'duplicate')
                            and batch_id in (select id from upload_batches where task_item_id = %s)""", (item_id,))
            title, body = f"{label} needs changes: {it['title']}", remark
            conn.execute("insert into messages (teacher_id, sender, body, request_id) values (%s,'crp',%s,%s)", (it['teacher_id'], f"{title}\n{remark}", it['request_id']))
        else:
            conn.execute("update task_items set status = 'accepted', review_remark = null, added_to = %s, reviewed_at = now() where id = %s", (req.add_to, item_id))
            title, body = f"{label} accepted: {it['title']}", None
        conn.execute("insert into notifications (recipient_type, teacher_id, title, body) values ('teacher',%s,%s,%s)", (it['teacher_id'], title, body))
        tasks.refresh_request(conn, it['request_id'])
        conn.commit()
    push.notify_teacher(it['teacher_id'], title, body, f"/task?id={it['request_id']}")
    return dict(ok=True, status='rejected' if req.action == 'reject' else 'accepted', queued=queued, skipped_duplicates=skipped)


class RequestPatch(BaseModel):
    status: str


@router.patch('/requests/{rid}')
def edit_request(rid: str, req: RequestPatch):
    if req.status not in ('open', 'accepted', 'cancelled'): raise HTTPException(400, 'bad status')
    with get_conn() as conn:
        r = conn.execute('update teacher_requests set status = %s where id = %s returning teacher_id, title', (req.status, rid)).fetchone()
        if r and req.status == 'accepted':
            conn.execute("insert into notifications (recipient_type, teacher_id, title) values ('teacher', %s, %s)", (r['teacher_id'], f"Thank you: '{r['title']}' was accepted"))
        conn.commit()
    if r and req.status == 'accepted': push.notify_teacher(r['teacher_id'], f"Thank you: '{r['title']}' was accepted", None, f'/task?id={rid}')
    return dict(ok=True)


@router.get('/teachers/{tid}/messages')
def messages(tid: str):
    with get_conn() as conn:
        rows = conn.execute('select * from messages where teacher_id = %s order by created_at', (tid,)).fetchall()
        conn.execute("update messages set read_at = now() where teacher_id = %s and sender = 'teacher' and read_at is null", (tid,)); conn.commit()
    return [_row(r) for r in rows]


class MessageReq(BaseModel):
    body: str


@router.post('/teachers/{tid}/messages')
def send_message(tid: str, req: MessageReq):
    if not req.body.strip(): raise HTTPException(400, 'empty message')
    with get_conn() as conn:
        conn.execute("insert into messages (teacher_id, sender, body) values (%s,'crp',%s)", (tid, req.body.strip()))
        conn.execute("insert into notifications (recipient_type, teacher_id, title, body) values ('teacher',%s,'New message from your CRP',%s)", (tid, req.body.strip()[:200]))
        conn.commit()
    push.notify_teacher(tid, 'New message from your CRP', req.body.strip()[:200], '/messages')
    return messages(tid)


@router.get('/notifications')
def crp_notifications(unread_only: bool = False):
    with get_conn() as conn:
        rows = conn.execute("select * from notifications where recipient_type = 'crp' and (not %s or read_at is null) order by created_at desc limit 50", (unread_only,)).fetchall()
    return [_row(r) for r in rows]


@router.post('/notifications/read')
def read_all():
    with get_conn() as conn:
        conn.execute("update notifications set read_at = now() where recipient_type = 'crp' and read_at is null"); conn.commit()
    return dict(ok=True)
