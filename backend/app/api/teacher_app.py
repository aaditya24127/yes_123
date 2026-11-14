"""Teacher app API: sign in, see tasks and notifications from the CRP, upload what was asked, send concerns, see own visits.
Everything is limited to the signed-in teacher (the id comes from the token, never from the request)."""
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from ..services import assessment, push, report, tasks, teacher_auth
from ..services.ingest import pipeline, readers
from ..services.prioritization.data import get_conn
from .connect import KIND_LABEL, KIND_SECTION, _row

router = APIRouter(prefix='/api/teacher', tags=['teacher app'])


class LoginReq(BaseModel):
    email: str
    password: str


class PasswordReq(BaseModel):
    old_password: str
    new_password: str


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSub(BaseModel):
    endpoint: str
    keys: PushKeys


class PushOff(BaseModel):
    endpoint: str


class MessageReq(BaseModel):
    body: str
    concern: bool = True


def _me(conn, tid):
    t = conn.execute("""select t.*, s.name as school_name, s.code as school_code, a.email from teachers t join schools s on s.id = t.school_id
                        join teacher_accounts a on a.teacher_id = t.id where t.id = %s""", (tid,)).fetchone()
    if not t: raise HTTPException(401, 'Please sign in again.')
    return t


def _profile(t):
    return dict(id=str(t['id']), name=f"{t['title'] or ''} {t['full_name']}".strip(), email=t['email'], school=t['school_name'],
                classes=t['classes_taught'], subjects=t['subjects_taught'])


@router.post('/login')
def login(req: LoginReq):
    tid = teacher_auth.login(req.email, req.password)
    with get_conn() as conn:
        return dict(token=teacher_auth.make_token(tid), teacher=_profile(_me(conn, tid)))


@router.get('/home')
def home(tid: str = Depends(teacher_auth.current_teacher)):
    """Everything the app shows. Reading it changes nothing, so the app can refresh it every few seconds."""
    with get_conn() as conn:
        t = _me(conn, tid)
        reqs = conn.execute("select * from teacher_requests where teacher_id = %s and status <> 'cancelled' order by (status = 'open') desc, created_at desc limit 60", (tid,)).fetchall()
        msgs = conn.execute('select * from messages where teacher_id = %s order by created_at desc limit 80', (tid,)).fetchall()
        notes = conn.execute("select * from notifications where recipient_type = 'teacher' and teacher_id = %s order by created_at desc limit 30", (tid,)).fetchall()
        visit = conn.execute("select visit_date, message from teacher_requests where teacher_id = %s and kind = 'visit_notice' and status <> 'cancelled' and visit_date >= current_date order by visit_date limit 1", (tid,)).fetchone()
        its = tasks.items_by_request(conn, [r['id'] for r in reqs])
    return dict(teacher=_profile(t), upcoming_visit=_row(visit) if visit else None, tasks=[dict(_row(r), items=its.get(str(r['id']), [])) for r in reqs], messages=[_row(m) for m in reversed(msgs)],
                notifications=[_row(n) for n in notes], unread=sum(1 for n in notes if n['read_at'] is None), kinds=KIND_LABEL)


@router.post('/notifications/read')
def read_notifications(tid: str = Depends(teacher_auth.current_teacher)):
    with get_conn() as conn:
        conn.execute("update notifications set read_at = now() where recipient_type = 'teacher' and teacher_id = %s and read_at is null", (tid,))
        conn.execute("update messages set read_at = now() where teacher_id = %s and sender <> 'teacher' and read_at is null", (tid,))
        conn.commit()
    return dict(ok=True)


@router.post('/messages')
def send_message(req: MessageReq, tid: str = Depends(teacher_auth.current_teacher)):
    body = req.body.strip()
    if not body: raise HTTPException(400, 'Please write a message.')
    with get_conn() as conn:
        t = _me(conn, tid)
        conn.execute("insert into messages (teacher_id, sender, body, is_concern) values (%s,'teacher',%s,%s)", (tid, body, req.concern))
        conn.execute("insert into notifications (recipient_type, title, body, link) values ('crp', %s, %s, '/connect')",
                     (f"{'Concern' if req.concern else 'Message'} from {t['full_name']}", body[:200]))
        conn.commit()
    return dict(ok=True)


@router.post('/submit')
async def submit(task_id: str | None = Form(None), item_id: str | None = Form(None), text: str | None = Form(None),
                 files: list[UploadFile] = File(default=[]), tid: str = Depends(teacher_auth.current_teacher)):
    """Answer one numbered task (files and/or a note), confirm a visit notice, or send something unasked. Files go into the normal upload
    sorting, already tagged with this teacher, school and task; the CRP reviews them (accept or reject) from the Teachers page."""
    text = (text or '').strip() or None
    with get_conn() as conn:
        t = _me(conn, tid)
        it = None
        if item_id:
            it = conn.execute("""select i.* from task_items i join teacher_requests r on r.id = i.request_id
                                 where i.id = %s and r.teacher_id = %s and r.status <> 'cancelled'""", (item_id, tid)).fetchone()
            if not it: raise HTTPException(404, 'That task was not found.')
            if it['status'] == 'accepted': raise HTTPException(400, 'This task was already accepted. Thank you!')
            task_id = str(it['request_id'])
        r = conn.execute('select * from teacher_requests where id = %s and teacher_id = %s', (task_id, tid)).fetchone() if task_id else None
        if task_id and not r: raise HTTPException(404, 'That task was not found.')
        if r and not it and r['kind'] != 'visit_notice':      # an older app version: answer the first task still waiting
            it = conn.execute("select * from task_items where request_id = %s and status in ('open', 'rejected') order by position limit 1", (task_id,)).fetchone()
    got = [(f.filename or 'file', await f.read()) for f in files if f.filename]
    if any(readers.format_of(n) in readers.AUDIO for n, _ in got): raise HTTPException(400, 'Audio recordings cannot be sent from this app. Send documents or photos instead.')
    if not got and not text: raise HTTPException(400, 'Add a file or write a note first.')
    kind = it['kind'] if it else (r['kind'] if r else None)
    bid = None
    if got:
        bid = pipeline.create_batch(got, origin='teacher', created_by=t['full_name'], hint_school_id=t['school_id'], hint_teacher_id=tid,
                                    hint_section=KIND_SECTION.get(kind), note=f"From {t['full_name']}" + (f": Task {it['position']}, {it['title']}" if it else (f": {r['title']}" if r else '')))
    with get_conn() as conn:
        if bid and it: conn.execute('update upload_batches set task_item_id = %s where id = %s', (it['id'], bid))
        if it:
            conn.execute("update task_items set status = 'submitted', response_text = coalesce(%s, response_text), review_remark = null, submitted_at = now() where id = %s", (text, it['id']))
            tasks.refresh_request(conn, it['request_id'])
        elif r:                                               # a visit notice that the teacher has seen
            conn.execute("update teacher_requests set status = 'submitted', response_text = %s, responded_at = now() where id = %s", (text, r['id']))
        if text:
            conn.execute("insert into messages (teacher_id, sender, body, request_id) values (%s,'teacher',%s,%s)", (tid, text, r['id'] if r else None))
        if it:
            title = f"{t['full_name']} sent Task {it['position']}"
            body = it['title'] + (f" ({len(got)} file{'s' if len(got) != 1 else ''})" if got else '')
        else:
            title = f"{t['full_name']} sent {len(got)} file(s)" if got else f"Reply from {t['full_name']}"
            body = r['title'] if r else (text or '')
        conn.execute("insert into notifications (recipient_type, title, body, link) values ('crp', %s, %s, '/connect')", (title, body[:200]))
        conn.commit()
    return dict(ok=True, files=len(got), batch_id=str(bid) if bid else None)


@router.get('/visits')
def my_visits(tid: str = Depends(teacher_auth.current_teacher)):
    """The teacher's own history: CRP visits and the actions agreed with them."""
    with get_conn() as conn:
        vs = conn.execute("select visit_date, visit_type from visits where teacher_id = %s order by visit_date desc limit 30", (tid,)).fetchall()
        fu = conn.execute("""select f.due_date, f.status, i.approved_action as action from follow_ups f left join interventions i on i.id = f.intervention_id
                             where f.teacher_id = %s order by f.due_date desc limit 30""", (tid,)).fetchall()
        try:     # needs migration 0017; without it the page still works, just with no reports
            rp = conn.execute("""select id, started_at, class_no, subject, topic from visit_sessions where teacher_id = %s and report_sent_at is not null
                                 order by started_at desc limit 20""", (tid,)).fetchall()
        except Exception:
            rp = []
    reports = [dict(id=str(x['id']), date=x['started_at'].date().isoformat(), class_no=x['class_no'], subject=x['subject'], topic=x['topic'],
                    url=f"/api/report/{x['id']}.pdf?sig={report.sig(str(x['id']))}") for x in rp]
    return dict(visits=[_row(v) for v in vs], follow_ups=[_row(f) for f in fu], reports=reports)


@router.post('/password')
def change_password(req: PasswordReq, tid: str = Depends(teacher_auth.current_teacher)):
    if len(req.new_password) < 6: raise HTTPException(400, 'Use at least 6 characters.')
    with get_conn() as conn:
        a = conn.execute('select password_hash from teacher_accounts where teacher_id = %s', (tid,)).fetchone()
        if not a or not teacher_auth.check_password(req.old_password, a['password_hash']): raise HTTPException(400, 'Your current password is not correct.')
        conn.execute('update teacher_accounts set password_hash = %s where teacher_id = %s', (teacher_auth.hash_password(req.new_password), tid)); conn.commit()
    return dict(ok=True)


# ---------------------------------------------------------------- phone / browser alerts (Web Push)
@router.get('/push/key')
def push_key():
    """The public key the browser needs to subscribe (null = push is not set up on this server)."""
    return dict(key=push.public_key())


@router.post('/push/subscribe')
def push_subscribe(sub: PushSub, tid: str = Depends(teacher_auth.current_teacher), user_agent: str | None = Header(None)):
    if not push.configured(): raise HTTPException(503, 'Alerts are not set up on the server yet.')
    if not sub.endpoint.startswith('https://'): raise HTTPException(400, 'Not a valid push address.')
    with get_conn() as conn:
        push.save_subscription(conn, tid, sub.endpoint, sub.keys.p256dh, sub.keys.auth, user_agent)
    return dict(ok=True)


@router.post('/push/unsubscribe')
def push_unsubscribe(off: PushOff, tid: str = Depends(teacher_auth.current_teacher)):
    with get_conn() as conn:
        push.remove_subscription(conn, tid, off.endpoint)
    return dict(ok=True)


@router.post('/push/test')
def push_test(tid: str = Depends(teacher_auth.current_teacher)):
    """Send a test alert to this teacher's own devices."""
    if not push.configured(): raise HTTPException(503, 'Alerts are not set up on the server yet.')
    with get_conn() as conn:
        n = push.count_for(conn, tid)
    if not n: raise HTTPException(400, 'Turn on alerts on this device first.')
    push.notify_teacher(tid, 'Test alert', 'If you can see this, alerts are working.', '/', wait=True)
    return dict(ok=True, devices=n)


# ---------------------------------------------------------------- the before-visit assessment (spoken questions)
def _my_assessment(conn, aid, tid):
    a = conn.execute('select * from teacher_assessments where id = %s and teacher_id = %s and status <> %s', (aid, tid, 'cancelled')).fetchone()
    if not a: raise HTTPException(404, 'That assessment was not found.')
    return a


def _assessment_out(a):
    v = assessment.teacher_view(a)
    v['pdf_url'] = f"/api/report/assessment/{v['id']}.pdf?sig={report.sig('a-' + v['id'])}" if a['status'] == 'reported' else None
    return v


@router.get('/assessments')
def my_assessments(tid: str = Depends(teacher_auth.current_teacher)):
    """The assessments the CRP asked this teacher for (waiting, in progress, or with a report)."""
    with get_conn() as conn:
        rows = conn.execute("select * from teacher_assessments where teacher_id = %s and status in ('ready', 'in_progress', 'submitted', 'reported') order by requested_at desc limit 8", (tid,)).fetchall()
    return [_assessment_out(a) for a in rows]


@router.get('/assessments/{aid}')
def my_assessment(aid: str, tid: str = Depends(teacher_auth.current_teacher)):
    with get_conn() as conn:
        return _assessment_out(_my_assessment(conn, aid, tid))


@router.post('/assessments/{aid}/start')
def assessment_start(aid: str, tid: str = Depends(teacher_auth.current_teacher)):
    with get_conn() as conn:
        a = _my_assessment(conn, aid, tid)
        if a['status'] not in ('ready', 'in_progress'): raise HTTPException(400, 'This assessment cannot be started now.')
        conn.execute("update teacher_assessments set status = 'in_progress', started_at = coalesce(started_at, now()) where id = %s", (aid,))
        conn.execute("insert into notifications (recipient_type, title, body, link) values ('crp', 'Assessment started', %s, '/visit')", (f"{a['subject']}: {a['chapter']}",))
        conn.commit()
        return _assessment_out(_my_assessment(conn, aid, tid))


@router.post('/assessments/{aid}/answers/{n}')
async def assessment_answer(aid: str, n: int, file: UploadFile | None = File(None), text: str | None = Form(None), tid: str = Depends(teacher_auth.current_teacher)):
    """One answer, spoken (a recording that is read and then dropped) or typed. Only the words and the speaking data are kept."""
    with get_conn() as conn:
        _my_assessment(conn, aid, tid)
    segs, seconds, source, said = None, None, 'typed', (text or '').strip()
    if file is not None and file.filename:
        data = await file.read()
        if len(data) > 24 * 1024 * 1024: raise HTTPException(413, 'This recording is too long. Please answer in under 5 minutes.')
        if not data: raise HTTPException(400, 'The recording is empty.')
        tr, _ = await run_in_threadpool(pipeline.transcribe, data, file.filename)
        if not tr: raise HTTPException(422, 'We could not hear your answer clearly. Please check the microphone, speak a little closer, and answer again.')
        said = (tr.get('text') or '').strip() or ' '.join(x['text'] for x in tr.get('segments', []))
        segs, source = tr.get('segments'), 'voice'
    if not said: raise HTTPException(400, 'Please answer the question first.')
    try:
        row = assessment.add_answer(aid, tid, n, said, source, segs, seconds)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return dict(ok=True, words=row['words'], source=source)


@router.post('/assessments/{aid}/finish')
def assessment_finish(aid: str, tid: str = Depends(teacher_auth.current_teacher)):
    """After the last answer: the report is written in the background (the app asks again until it is ready)."""
    from ..jobs import enqueue
    with get_conn() as conn:
        a = _my_assessment(conn, aid, tid)
        if a['status'] == 'reported': return _assessment_out(a)
        if a['status'] not in ('in_progress', 'submitted'): raise HTTPException(400, 'This assessment is not open.')
        done = sum(1 for x in a['answers'] if x['words'])
        need = (len(a['questions']) + 1) // 2
        if done < need: raise HTTPException(400, f'Please answer at least {need} questions first. You have answered {done}.')
        if a['status'] == 'in_progress' or a.get('error'):
            conn.execute("update teacher_assessments set status = 'submitted', submitted_at = coalesce(submitted_at, now()), error = null where id = %s", (aid,))
            enqueue('assessment_report', {'assessment_id': aid}, conn=conn)
        conn.commit()
        return _assessment_out(_my_assessment(conn, aid, tid))
