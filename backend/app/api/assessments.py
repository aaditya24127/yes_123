"""CRP side of the before-visit assessment: ask for it, follow it, read the report. (The teacher's side is in teacher_app.py.)"""
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..services import assessment, assessment_report, report
from ..services.prioritization.data import get_conn
from .visits import _who_is_signed_in

router = APIRouter(prefix='/api/assessments', tags=['assessments'])
public = APIRouter(prefix='/api/report', tags=['assessments'])       # the report link inside the teacher app (signed, like the visit report link)


class StartReq(BaseModel):
    teacher_id: str
    class_no: int | None = None
    subject: str
    chapter: str
    question_count: int = 8
    ai_choice: str = 'auto'          # auto | claude | free


def _get(conn, aid):
    a = conn.execute('select a.*, t.full_name as teacher_name from teacher_assessments a join teachers t on t.id = a.teacher_id where a.id = %s', (aid,)).fetchone()
    if not a: raise HTTPException(404, 'Assessment not found.')
    return a


@router.post('')
def start(req: StartReq, request: Request):
    """The CRP presses "Start assessment": the questions are written in the background and the teacher is told as soon as they are ready."""
    with get_conn() as conn:
        me = _who_is_signed_in(conn, request)
        try:
            a = assessment.create(conn, teacher_id=req.teacher_id, class_no=req.class_no, subject=req.subject, chapter=req.chapter, count=req.question_count,
                                  ai_choice=req.ai_choice, requested_by=me['name'])
        except ValueError as e:
            raise HTTPException(400, str(e))
        return assessment.crp_view(_get(conn, a['id']))


@router.get('')
def recent(teacher_id: str | None = None, limit: int = 8):
    with get_conn() as conn:
        rows = conn.execute("""select a.*, t.full_name as teacher_name from teacher_assessments a join teachers t on t.id = a.teacher_id
                               where (%s::uuid is null or a.teacher_id = %s) and a.status <> 'cancelled' order by a.requested_at desc limit %s""", (teacher_id, teacher_id, min(limit, 30))).fetchall()
    return [assessment.crp_view(a) for a in rows]


@router.get('/{aid}')
def one(aid: str):
    with get_conn() as conn:
        return assessment.crp_view(_get(conn, aid), full=True)


@router.post('/{aid}/cancel')
def cancel(aid: str):
    with get_conn() as conn:
        a = _get(conn, aid)
        if a['status'] in ('reported', 'cancelled'): raise HTTPException(400, 'This assessment is already finished.')
        conn.execute("update teacher_assessments set status = 'cancelled' where id = %s", (aid,)); conn.commit()
    return dict(ok=True)


class RebuildReq(BaseModel):
    ai_choice: str | None = None


@router.post('/{aid}/report/rebuild')
def rebuild(aid: str, req: RebuildReq):
    """Write the report again (for example with another AI choice, or after a failure). Needs the answers that were already given."""
    from ..jobs import enqueue
    with get_conn() as conn:
        a = _get(conn, aid)
        if not any(x['words'] for x in a['answers']): raise HTTPException(400, 'There are no answers to write a report from yet.')
        if req.ai_choice in ('auto', 'claude', 'free'): conn.execute('update teacher_assessments set ai_choice = %s where id = %s', (req.ai_choice, aid))
        conn.execute("update teacher_assessments set status = 'submitted', error = null where id = %s", (aid,))
        enqueue('assessment_report', {'assessment_id': aid}, conn=conn); conn.commit()
        return assessment.crp_view(_get(conn, aid))


@router.get('/{aid}/report.pdf')
def report_pdf(aid: str, download: bool = False):
    try:
        name, pdf = assessment_report.build(aid)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return Response(pdf, media_type='application/pdf', headers={'Content-Disposition': f'{"attachment" if download else "inline"}; filename="{name}"'})


@public.get('/assessment/{aid}.pdf')
def report_for_teacher(aid: str, sig: str = ''):
    """Link inside the teacher app: works only with the signed code that was sent with it."""
    if not report.sig_ok(f'a-{aid}', sig): raise HTTPException(404, 'This report link is not valid.')
    try:
        name, pdf = assessment_report.build(aid)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return Response(pdf, media_type='application/pdf', headers={'Content-Disposition': f'inline; filename="{name}"'})
