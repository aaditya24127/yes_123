"""Bulk upload: drop many files (or a zip) -> automatic sorting -> CRP checks -> import in the background."""
import datetime as dt

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from ..core.storage import get_storage
from ..services.ingest import allocation, pipeline, readers
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


class AddSchool(BaseModel):
    name: str | None = None
    school_type: str | None = None
    board: str | None = None
    medium: str | None = None
    grade_from: int | None = None
    grade_to: int | None = None
    teachers: list[str] | None = None


@router.post('/items/{item_id}/add-school')
def add_school(item_id: str, req: AddSchool):
    """New school detected -> add it (with the teachers the CRP kept) and file this upload under it."""
    try:
        return pipeline.add_detected_school(item_id, req.model_dump(exclude={'teachers'}, exclude_unset=True), req.teachers)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get('/items/{item_id}/found')
def item_found(item_id: str):
    """View details on a New school file: what is inside the file (read once, then kept)."""
    d = pipeline.read_found(item_id)
    if d is None: raise HTTPException(404, 'file not found')
    return d


@router.post('/{batch_id}/import')
def start_import(batch_id: str):
    n = pipeline.start_import(batch_id)
    return dict(queued=n)


@router.get('/items/{item_id}/allocation')
def item_allocation(item_id: str):
    """Which priority each part of this file feeds (before Import: what its kind feeds; after Import: what was really taken)."""
    with get_conn() as conn:
        u = conn.execute('select section, status, source_file_id, result from upload_items where id = %s', (item_id,)).fetchone()
        if not u: raise HTTPException(404, 'file not found')
        if u['status'] == 'imported' and u['source_file_id']:
            rows = allocation.actual(conn, u['source_file_id'], (u['result'] or {}).get('counts'))
            if rows: return dict(state='done', rows=rows)
            return dict(state='done', rows=allocation.expected(conn, 'other'), nothing=True)
        return dict(state='expected', section=u['section'], rows=allocation.expected(conn, u['section'] or 'other'))


@router.get('/items/{item_id}/raw')
def item_raw(item_id: str):
    """The file as uploaded (before or after import), so the CRP can open a teacher's file while deciding to accept it."""
    with get_conn() as conn:
        u = conn.execute('select original_filename, file_format, temp_path from upload_items where id = %s', (item_id,)).fetchone()
    if not u: raise HTTPException(404, 'file not found')
    st = get_storage()
    if not st.exists(u['temp_path']): raise HTTPException(404, 'file is no longer in storage')
    name = u['original_filename'].replace('"', '')
    return Response(st.get(u['temp_path']), media_type=readers.MIME.get(u['file_format'], 'application/octet-stream'), headers={'Content-Disposition': f'inline; filename="{name}"'})
