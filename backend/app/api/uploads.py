"""Bulk upload: drop many files (or a zip) -> automatic sorting -> CRP checks -> import in the background."""
import datetime as dt

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from ..services.ingest import pipeline
from ..services.prioritization.data import get_conn

router = APIRouter(prefix='/api/uploads', tags=['uploads'])
MAX_TOTAL = 500 * 1024 * 1024


@router.post('')
async def upload(files: list[UploadFile] = File(...), school_id: str | None = Form(None), teacher_id: str | None = Form(None),
                 section: str | None = Form(None), note: str | None = Form(None)):
    got, total = [], 0
    for f in files:
        data = await f.read(); total += len(data)
        if total > MAX_TOTAL: raise HTTPException(413, 'Too much at once (500 MB limit). Upload in smaller groups.')
        got.append((f.filename or 'file', data))
    if not got: raise HTTPException(400, 'No files received')
    bid = pipeline.create_batch(got, origin='crp', hint_school_id=school_id or None, hint_teacher_id=teacher_id or None, hint_section=section or None, note=note)
    return pipeline.batch_view(bid)


@router.get('')
def recent(limit: int = 20):
    with get_conn() as conn:
        rows = conn.execute("""select b.id, b.created_at, b.status, b.origin, b.note, count(u.id) as files,
                               count(*) filter (where u.status = 'imported') as imported, count(*) filter (where u.status = 'needs_attention') as attention
                               from upload_batches b left join upload_items u on u.batch_id = b.id group by b.id order by b.created_at desc limit %s""", (limit,)).fetchall()
    return [dict(r, id=str(r['id']), created_at=r['created_at'].isoformat()) for r in rows]


@router.get('/{batch_id}')
def get_batch(batch_id: str):
    v = pipeline.batch_view(batch_id)
    if not v: raise HTTPException(404, 'upload not found')
    return v


class ItemPatch(BaseModel):
    school_id: str | None = None
    teacher_id: str | None = None
    section: str | None = None
    record_date: dt.date | None = None
    status: str | None = None


@router.patch('/items/{item_id}')
def edit_item(item_id: str, req: ItemPatch):
    try:
        pipeline.update_item(item_id, **req.model_dump(exclude_unset=True))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return dict(ok=True)


@router.post('/{batch_id}/import')
def start_import(batch_id: str):
    n = pipeline.start_import(batch_id)
    return dict(queued=n)
