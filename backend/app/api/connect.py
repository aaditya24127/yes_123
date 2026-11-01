"""CRP <-> teacher: requests (send marks, syllabus plan, a lesson recording...), visit notices, messages, notifications,
so data can come in between visits. The teacher's side (sign in, tasks, uploads, concerns) is in teacher_app.py."""
import datetime as dt

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import push
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


class RequestReq(BaseModel):
    teacher_ids: list[str] = []
    school_id: str | None = None          # all teachers of this school
    kind: str
    title: str | None = None
    message: str | None = None
    due_date: dt.date | None = None
    visit_date: dt.date | None = None


@router.post('/requests')
def create_requests(req: RequestReq):
    if req.kind not in KIND_LABEL: raise HTTPException(400, 'unknown request type')
    with get_conn() as conn:
        tids = list(req.teacher_ids)
        if req.school_id and not tids:
            tids = [str(r['id']) for r in conn.execute('select id from teachers where school_id = %s and is_active', (req.school_id,)).fetchall()]
        if not tids: raise HTTPException(400, 'choose at least one teacher')
        title = req.title or (f"CRP visit on {req.visit_date:%d %b %Y}" if req.kind == 'visit_notice' and req.visit_date else KIND_LABEL[req.kind])
        ids, pushes = [], []
        for tid in tids:
            t = conn.execute('select school_id from teachers where id = %s', (tid,)).fetchone()
            if not t: continue
            rid = conn.execute("""insert into teacher_requests (school_id, teacher_id, kind, title, message, due_date, visit_date, created_by) values (%s,%s,%s,%s,%s,%s,%s,'crp') returning id""",
                               (t['school_id'], tid, req.kind, title, req.message, req.due_date, req.visit_date)).fetchone()['id']
            body = req.message or title
            if req.kind == 'visit_notice' and req.visit_date: body = f"Your CRP will visit on {req.visit_date:%A %d %B}. {req.message or 'Please keep your lesson plan, recent marks and attendance ready.'}"
            conn.execute("insert into messages (teacher_id, sender, body, request_id) values (%s,'crp',%s,%s)", (tid, body, rid))
            conn.execute("insert into notifications (recipient_type, teacher_id, title, body) values ('teacher',%s,%s,%s)", (tid, title, body))
            ids.append(str(rid)); pushes.append((tid, title, body, f'/task?id={rid}'))
        conn.commit()
    for p in pushes: push.notify_teacher(*p)
    return dict(created=len(ids), ids=ids)


@router.get('/requests')
def list_requests(teacher_id: str | None = None, status: str | None = None, limit: int = 100):
    with get_conn() as conn:
        rows = conn.execute("""select r.*, t.full_name as teacher_name, s.name as school_name from teacher_requests r join schools s on s.id = r.school_id
                               left join teachers t on t.id = r.teacher_id where (%s::uuid is null or r.teacher_id = %s) and (%s::text is null or r.status = %s)
                               order by r.created_at desc limit %s""", (teacher_id, teacher_id, status, status, limit)).fetchall()
    return [_row(r) for r in rows]


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
