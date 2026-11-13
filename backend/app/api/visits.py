"""The 4-step visit (brief -> class -> students -> results) and textbook search / linking."""
import datetime as dt
import hashlib, json, re

from fastapi.concurrency import run_in_threadpool
from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel

from .. import ai
from ..core.storage import get_storage
from ..jobs import enqueue, job_status
from ..services import crp_auth, mailer, push, report, textbooks, visit
from ..services.ingest import readers
from ..services.ingest.pipeline import _school_folder, looks_like_silence, transcribe
from ..services.prioritization.data import get_conn

router = APIRouter(prefix='/api', tags=['visits'])


# ---------------------------------------------------------------- step 1
@router.get('/brief')
def get_brief(teacher_id: str | None = None, school_id: str | None = None, fast: bool = False):
    if not teacher_id and not school_id: raise HTTPException(400, 'choose a teacher or a school')
    try:
        return visit.brief(teacher_id, school_id, fast=fast)
    except ValueError as e:
        raise HTTPException(404, str(e))


class SessionReq(BaseModel):
    school_id: str | None = None
    teacher_id: str | None = None
    class_no: int | None = None
    subject: str | None = None
    topic: str | None = None
    brief_text: dict | None = None      # the briefing already shown on screen, so starting a visit does not wait for the AI again
    brief_by: str | None = None


def _who_is_signed_in(conn, request: Request):
    """Name (and cluster) of the signed-in mentor, kept with each visit so the school's history says who was there."""
    try:
        a = crp_auth.get_account(conn, getattr(request.state, 'crp_account_id', None))
    except Exception:
        a = None
    if not a: return dict(name=None, crp_id=None)
    return dict(name=f"{a['title'] or ''} {a['full_name']}".strip(), crp_id=a['crp_id'])


@router.post('/sessions')
def start_session(req: SessionReq, request: Request):
    if req.brief_text:
        b = visit.brief(req.teacher_id, req.school_id, fast=True)
        b['brief'], b['brief_by'] = req.brief_text, req.brief_by
    else:
        b = visit.brief(req.teacher_id, req.school_id)
    with get_conn() as conn:
        me = _who_is_signed_in(conn, request)
        sid = conn.execute("""insert into visit_sessions (school_id, teacher_id, class_no, subject, topic, stage, brief, mentor_name, crp_id) values (%s,%s,%s,%s,%s,2,%s,%s,%s) returning id""",
                           (b['school']['id'], req.teacher_id, req.class_no, req.subject, req.topic, json.dumps(b, default=str), me['name'], me['crp_id'])).fetchone()['id']
        conn.commit()
    return get_session(str(sid))


def _media_view(m):
    return dict(id=str(m['id']), kind=m['kind'], question_index=m['question_index'], student_label=m['student_label'], file_id=str(m['source_file_id']) if m['source_file_id'] else None,
                name=m['original_filename'], duration=float(m['duration_seconds']) if m['duration_seconds'] else None, transcript=m['transcript'], transcript_by=m['transcript_by'])


@router.get('/sessions/{sid}')
def get_session(sid: str):
    with get_conn() as conn:
        try:
            s, media = visit.load_session(conn, sid)
        except ValueError as e:
            raise HTTPException(404, str(e))
    job = job_status(str(s['job_id'])) if s['job_id'] else None
    return dict(id=str(s['id']), school_id=str(s['school_id']), teacher_id=str(s['teacher_id']) if s['teacher_id'] else None, class_no=s['class_no'], subject=s['subject'],
                topic=s['topic'], stage=s['stage'], status=s['status'], brief=s['brief'], followup_days=s.get('followup_days') or 14,
                report_sent_at=s['report_sent_at'].isoformat() if s.get('report_sent_at') else None, report_sent_to=s.get('report_sent_to'), crp_notes=s['crp_notes'], changes_since_last=s['changes_since_last'],
                questions=s['questions'], result=s['result'], media=[_media_view(m) for m in media], started_at=s['started_at'].isoformat(), mentor_name=s.get('mentor_name'),
                job=None if not job else dict(status=job['status'], error=job['error'], provider=job['provider']), visit_id=str(s['visit_id']) if s['visit_id'] else None)


@router.get('/sessions')
def list_sessions(teacher_id: str | None = None, school_id: str | None = None, limit: int = 20):
    with get_conn() as conn:
        rows = conn.execute("""select v.id, v.started_at, v.status, v.stage, v.class_no, v.subject, v.topic, s.name as school_name, t.full_name as teacher_name, v.mentor_name
                               from visit_sessions v join schools s on s.id = v.school_id left join teachers t on t.id = v.teacher_id
                               where (%s::uuid is null or v.teacher_id = %s) and (%s::uuid is null or v.school_id = %s) and v.status <> 'cancelled'
                               order by v.started_at desc limit %s""", (teacher_id, teacher_id, school_id, school_id, limit)).fetchall()
    return [dict(r, id=str(r['id']), started_at=r['started_at'].isoformat()) for r in rows]


# ---------------------------------------------------------------- visit notes by voice, photo or in another language
# Nothing here is stored: the recording or photo is read, the text goes back to the screen, and the file is dropped.
SHORT_CLIP = 120                       # seconds: recordings up to this are turned into text while the person waits
MAX_NOTE_AUDIO = 24 * 1024 * 1024
MAX_NOTE_PHOTO = 12 * 1024 * 1024


@router.post('/notes/voice')
def notes_voice(file: UploadFile = File(...)):
    """Speech to text for the notes box (any language, also mixed). The recording is not kept."""
    data = file.file.read(MAX_NOTE_AUDIO + 1)
    if len(data) > MAX_NOTE_AUDIO: raise HTTPException(413, 'This recording is too long. Please record in parts of up to about 20 minutes.')
    if not data: raise HTTPException(400, 'The recording is empty.')
    tr, _ = transcribe(data, file.filename or 'note.webm')
    if not tr: raise HTTPException(503, 'We could not turn the recording into text right now. Please type the note, or try again in a minute.')
    text = (tr.get('text') or '').strip() or ' '.join((x.get('text') or '').strip() for x in tr.get('segments', [])).strip()
    if looks_like_silence(text, len(data)):       # silence or noise that was read as a word or two
        raise HTTPException(422, 'We could not hear clear speech. Check that the microphone is on, speak close to it, and try again.')
    return dict(text=text, language=tr.get('language'))


@router.post('/notes/photo')
def notes_photo(file: UploadFile = File(...)):
    """Handwritten or printed notes in a photo -> text for the notes box. The photo is not kept."""
    data = file.file.read(MAX_NOTE_PHOTO + 1)
    name = file.filename or 'notes.jpg'
    fmt = readers.format_of(name)
    if fmt not in readers.IMAGE: raise HTTPException(400, 'Please add a photo (JPG, PNG or WEBP).')
    if len(data) > MAX_NOTE_PHOTO: raise HTTPException(413, 'This photo is too big. Please take it again at a lower quality.')
    try:
        r = ai.run('read_note_photo', {}, [ai.Attachment(name, readers.MIME[fmt], data)])
    except ai.AIUnavailable:
        raise HTTPException(503, 'We could not read the photo right now. Please type the note, or try again in a minute.')
    text = (r.data.get('text') or '').strip()
    if not text: raise HTTPException(422, 'We could not find any writing in this photo. Try a clearer, closer photo.')
    return dict(text=text, language=r.data.get('language'))


class NoteText(BaseModel):
    text: str


@router.post('/notes/translate')
def notes_translate(req: NoteText):
    """Notes in any language (or a mix) -> English. The original stays on the screen so the mentor can switch back."""
    text = req.text.strip()
    if not text: raise HTTPException(400, 'There is nothing to translate yet.')
    try:
        r = ai.run('notes_to_english', dict(text=text))
    except ai.AIUnavailable:
        raise HTTPException(503, 'Translation is not available right now. Please try again in a minute.')
    return dict(english=(r.data.get('english') or '').strip() or text, language=r.data.get('language'), already_english=bool(r.data.get('already_english')))


class AnswerReview(BaseModel):
    verdict: str | None = None          # 'agree' | 'correct' | 'partly' | 'wrong'; None puts the AI's verdict back
    reason: str | None = None


@router.patch('/sessions/{sid}/answers/{index}')
def review_answer(sid: str, index: int, req: AnswerReview, request: Request):
    """The mentor checks the AI's verdict on one student answer. Both stay on record; the mentor's counts as final."""
    if req.verdict not in (None, 'agree', 'correct', 'partly', 'wrong'): raise HTTPException(400, 'bad verdict')
    reason = (req.reason or '').strip()[:300] or None
    with get_conn() as conn:
        s = conn.execute('select result, status from visit_sessions where id = %s', (sid,)).fetchone()
        if not s: raise HTTPException(404, 'visit not found')
        res = s['result'] or {}
        pq = (res.get('students') or {}).get('per_question') or []
        if not 0 <= index < len(pq): raise HTTPException(404, 'answer not found')
        if req.verdict is None: pq[index].pop('mentor', None)
        else:
            me = _who_is_signed_in(conn, request)
            pq[index]['mentor'] = dict(verdict=req.verdict, reason=reason, by=me['name'], at=dt.datetime.now().isoformat(timespec='seconds'))
        conn.execute('update visit_sessions set result = %s where id = %s', (json.dumps(res), sid)); conn.commit()
    return get_session(sid)


class SessionPatch(BaseModel):
    crp_notes: str | None = None
    changes_since_last: str | None = None
    topic: str | None = None
    class_no: int | None = None
    subject: str | None = None
    stage: int | None = None
    questions: list | None = None
    status: str | None = None
    followup_days: int | None = None


@router.patch('/sessions/{sid}')
def edit_session(sid: str, req: SessionPatch):
    ch = req.model_dump(exclude_unset=True)
    if 'status' in ch and ch['status'] not in ('in_progress', 'cancelled'): raise HTTPException(400, 'bad status')
    if 'followup_days' in ch and not (ch['followup_days'] and 1 <= ch['followup_days'] <= 365): raise HTTPException(400, 'Follow-up days must be between 1 and 365.')
    if 'questions' in ch: ch['questions'] = json.dumps(ch['questions'])
    if ch:
        with get_conn() as conn:
            conn.execute(f"update visit_sessions set {', '.join(f'{k} = %s' for k in ch)} where id = %s", [*ch.values(), sid]); conn.commit()
    return get_session(sid)


# ---------------------------------------------------------------- step 2 and 3: recordings, notes, student answers
@router.post('/sessions/{sid}/media')
async def add_media(sid: str, file: UploadFile = File(...), kind: str = Form(...), question_index: int | None = Form(None), student_label: str | None = Form(None)):
    if kind not in ('lesson_audio', 'crp_notes_file', 'student_answer', 'photo', 'other'): raise HTTPException(400, 'unknown kind')
    data = await file.read()
    name = file.filename or 'recording.webm'
    fmt = readers.format_of(name)
    if not fmt: raise HTTPException(400, 'unsupported file type')
    rr = readers.read(data, name)
    with get_conn() as conn:
        s = conn.execute('select * from visit_sessions where id = %s', (sid,)).fetchone()
        if not s: raise HTTPException(404, 'visit not found')
        school = conn.execute('select * from schools where id = %s', (s['school_id'],)).fetchone()
        sha = hashlib.sha256(data).hexdigest()
        key = f"{_school_folder(conn, school)}/visit_session/{s['started_at']:%Y-%m-%d}_{str(sid)[:8]}_{sha[:8]}_{name}"
        get_storage().put(key, data, readers.MIME.get(fmt))
        sf = conn.execute("""insert into source_files (school_id, teacher_id, section, original_filename, storage_path, mime_type, file_format, size_bytes, sha256, doc_kind,
                             is_scanned, record_date, processing_status, extracted_text, duration_seconds) values (%s,%s,'visit_session',%s,%s,%s,%s,%s,%s,%s,%s,%s,'validated',%s,%s) returning id""",
                          (s['school_id'], s['teacher_id'], name, key, readers.MIME.get(fmt), fmt, len(data), sha, rr.kind, rr.scanned, s['started_at'].date(), rr.text or None,
                           rr.duration)).fetchone()['id']
        mid = conn.execute('insert into session_media (session_id, kind, question_index, student_label, source_file_id, transcript) values (%s,%s,%s,%s,%s,%s) returning id',
                           (sid, kind, question_index, student_label, sf, rr.text or None)).fetchone()['id']
        if fmt in readers.AUDIO:
            if (rr.duration or 0) <= SHORT_CLIP:                       # a short answer is read right now (a few seconds), not queued
                tr, note = await run_in_threadpool(transcribe, data, name)
                if tr:
                    text = (tr.get('text') or '').strip() or ' '.join(x['text'] for x in tr.get('segments', []))
                    conn.execute('update session_media set transcript = %s, transcript_by = %s where id = %s', (text, tr['by'], mid))
                    conn.execute('update source_files set extracted_text = %s where id = %s', (text, sf))
                else:
                    conn.execute('update session_media set transcript_by = %s where id = %s', (note, mid))
            else:
                enqueue('transcribe_media', {'media_id': str(mid)}, sf, conn=conn)
        conn.commit()
    return get_session(sid)


@router.delete('/sessions/{sid}/media/{mid}')
def remove_media(sid: str, mid: str):
    with get_conn() as conn:
        conn.execute('delete from session_media where id = %s and session_id = %s', (mid, sid)); conn.commit()
    return get_session(sid)


@router.post('/sessions/{sid}/questions')
def make_questions(sid: str):
    with get_conn() as conn:
        s, media = visit.load_session(conn, sid)
    inp = visit.session_input(s, media)
    inp = {k: inp[k] for k in ('school', 'teacher', 'class_no', 'subject', 'topic', 'language', 'crp_notes', 'lesson_transcript', 'textbook', 'open_issues')}
    try:
        r = ai.run('student_questions', inp)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    with get_conn() as conn:
        conn.execute('update visit_sessions set questions = %s, stage = greatest(stage, 3) where id = %s', (json.dumps(r.data['questions']), sid)); conn.commit()
    out = get_session(sid); out['question_tips'] = r.data.get('tips', []); out['questions_by'] = r.provider
    return out


# ---------------------------------------------------------------- step 4
@router.post('/sessions/{sid}/evaluate')
def evaluate(sid: str):
    with get_conn() as conn:
        jid = enqueue('evaluate_session', {'session_id': sid}, conn=conn)
        conn.execute("update visit_sessions set job_id = %s, stage = 4, result = '{}'::jsonb where id = %s and status in ('in_progress', 'evaluated')", (jid, sid))
        conn.execute("update visit_sessions set status = 'in_progress' where id = %s and status = 'evaluated'", (sid,))
        conn.commit()
    return get_session(sid)


class SaveReq(BaseModel):
    growth: list[int] | None = None
    next_steps: list[int] | None = None


@router.post('/sessions/{sid}/save')
def save(sid: str, req: SaveReq):
    try:
        return visit.save_to_records(sid, req.growth, req.next_steps)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ---------------------------------------------------------------- the written report for the teacher
def _pdf_response(name: str, pdf: bytes, download: bool):
    return Response(pdf, media_type='application/pdf', headers={'Content-Disposition': f'{"attachment" if download else "inline"}; filename="{name}"'})


@router.get('/sessions/{sid}/report.pdf')
def report_pdf(sid: str, download: bool = False):
    try:
        name, pdf = report.build(sid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _pdf_response(name, pdf, download)


@router.get('/report/{sid}.pdf')
def report_for_teacher(sid: str, sig: str = ''):
    """Link inside the teacher app: works only with the signed code that was sent with the report."""
    if not report.sig_ok(sid, sig): raise HTTPException(404, 'This report link is not valid.')
    try:
        name, pdf = report.build(sid)
    except ValueError:
        raise HTTPException(404, 'This report is not ready.')
    return _pdf_response(name, pdf, False)


class SendReportReq(BaseModel):
    email: str | None = None


@router.post('/sessions/{sid}/report/send')
def send_report(sid: str, req: SendReportReq):
    """Send the report to the teacher: always inside the teacher app (with an alert), and by email when a mail account is set up."""
    with get_conn() as conn:
        try:
            s, _ = visit.load_session(conn, sid)
        except ValueError as e:
            raise HTTPException(404, str(e))
        if not s['teacher_id']: raise HTTPException(400, 'This visit was for the whole school. Start a visit for one teacher to send a report.')
        acc = conn.execute('select email from teacher_accounts where teacher_id = %s', (s['teacher_id'],)).fetchone()
    try:
        name, pdf = report.build(sid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    to = (req.email or (acc or {}).get('email') or '').strip()
    who = ((s['brief'] or {}).get('teacher') or {}).get('name') or 'teacher'
    email_state, email_msg = ('skipped', '')
    if to:
        text = (f'Dear {who},' + chr(10) * 2 + 'Thank you for the visit. Your report is attached. It lists what went well, where to improve, '
                'the questions to ask in class and what we agreed to do next.' + chr(10) * 2 + 'Your CRP')
        email_state, email_msg = mailer.send(to, 'Your visit report', text, [(name, pdf, 'application/pdf')])
    with get_conn() as conn:
        conn.execute("insert into messages (teacher_id, sender, body) values (%s,'crp',%s)", (s['teacher_id'], 'Your visit report is ready. Open My visits to read it.'))
        conn.execute("insert into notifications (recipient_type, teacher_id, title, body, link) values ('teacher', %s, 'Your visit report is ready', 'Open My visits to read it.', '/visits')", (s['teacher_id'],))
        conn.commit()
    try:     # the "sent" stamp needs migration 0017; if it is missing the report has still been delivered
        with get_conn() as conn:
            conn.execute('update visit_sessions set report_sent_at = now(), report_sent_to = %s where id = %s', (to if email_state == 'sent' else None, sid)); conn.commit()
    except Exception:
        pass
    push.notify_teacher(s['teacher_id'], 'Your visit report is ready', 'Open My visits to read it.', '/visits')
    return dict(app=True, email=email_state, message=email_msg, to=to)


# ---------------------------------------------------------------- textbooks
@router.get('/textbooks/search')
def search_textbooks(q: str, class_no: int | None = None, subject: str | None = None, board: str | None = None, language: str | None = None):
    try:
        return textbooks.search(q, class_no, subject, board, language)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))


class ResourceReq(BaseModel):
    school_id: str | None = None
    teacher_id: str | None = None
    url: str
    title: str
    class_no: int | None = None
    subject: str | None = None
    publisher: str | None = None
    kind: str = 'textbook'


@router.post('/resources')
def add_resource(req: ResourceReq):
    if not req.url.startswith(('http://', 'https://')): raise HTTPException(400, 'please give a web address starting with http')
    sid = req.school_id
    if req.teacher_id and not sid:
        with get_conn() as conn:
            t = conn.execute('select school_id from teachers where id = %s', (req.teacher_id,)).fetchone()
            if not t: raise HTTPException(404, 'teacher not found')
            sid = str(t['school_id'])
    if not sid: raise HTTPException(400, 'choose a school or teacher')
    rid = textbooks.add(sid, req.teacher_id, req.url, req.title, req.class_no, req.subject, req.publisher, req.kind if req.kind in ('textbook', 'syllabus', 'teacher_guide', 'other') else 'other')
    return dict(id=rid)


@router.get('/resources')
def list_resources(teacher_id: str | None = None, school_id: str | None = None):
    return textbooks.list_for(teacher_id, school_id)


@router.delete('/resources/{rid}')
def remove_resource(rid: str):
    with get_conn() as conn:
        conn.execute('delete from teaching_resources where id = %s', (rid,)); conn.commit()
    return dict(ok=True)
