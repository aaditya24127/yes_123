"""CRP Mentor Copilot API. Run:  python -m uvicorn app.main:app --port 8000   (from the backend folder)"""
import csv, datetime as dt, io, os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')

import openpyxl
from docx import Document
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from app.core.storage import get_storage, LocalStorage
from app.services.prioritization import engine
from app.services.prioritization.data import Data, get_conn
from app.api import factors as factors_api, uploads as uploads_api, visits as visits_api, connect as connect_api, assistant as assistant_api, teacher_app as teacher_api, assessments as assessments_api
from app.api import auth as auth_api
from app.services import crp_auth
from app import jobs

app = FastAPI(title='CRP Mentor Copilot')

# Everything under /api needs a signed-in CRP, except: the health check, signing in itself, the teacher app (its own logins)
# and the signed report link a teacher opens. Added first, so CORS (added below) still wraps the "please sign in" answer.
PUBLIC_API = ('/api/health', '/api/auth/', '/api/teacher/', '/api/report/')


@app.middleware('http')
async def require_crp(request: Request, call_next):
    path = request.url.path
    if request.method == 'OPTIONS' or not path.startswith('/api/') or path.startswith(PUBLIC_API):
        return await call_next(request)
    account_id = crp_auth.from_request(request)
    if not account_id:
        return JSONResponse({'detail': 'Please sign in.'}, status_code=401)
    request.state.crp_account_id = account_id
    return await call_next(request)


# Which websites may call this API: comma-separated in ALLOWED_ORIGINS (add the real domain when the site goes live).
ORIGINS = [o.strip() for o in os.environ.get('ALLOWED_ORIGINS', 'http://localhost:3000,http://127.0.0.1:3000').split(',') if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=['*'], allow_headers=['*'])
app.add_middleware(GZipMiddleware, minimum_size=1000)      # big answers (priority list, evidence) travel compressed
for r in (auth_api, factors_api, uploads_api, visits_api, connect_api, assistant_api, teacher_api, assessments_api):
    app.include_router(r.router)
app.include_router(assessments_api.public)                  # the signed assessment-report link inside the teacher app


@app.on_event('startup')
def _start_workers():
    from app.services import teacher_auth
    with get_conn() as conn:
        teacher_auth.ensure_accounts(conn)     # demo logins for every teacher (firstname.lastname@crp.com)
        crp_auth.ensure_demo(conn)             # the demo CRP login (DEMO_CRP_EMAIL), unless DEMO_CRP_LOGIN=0
    jobs.start_in_api()     # background workers inside the API (WORKERS_IN_API, default 4); more can run separately: python -m app.jobs


def today(): return dt.date.today()


class RankReq(BaseModel):
    entity: str = 'school'
    weights: dict[str, float] | None = None
    as_of: dt.date | None = None


class EvidenceReq(BaseModel):
    entity: str = 'school'
    id: str
    as_of: dt.date | None = None


class ApplyReq(BaseModel):
    weights: dict[str, float]


def _check_entity(e):
    if e not in ('school', 'teacher'): raise HTTPException(400, 'entity must be school or teacher')


@app.get('/api/health')
def health():
    with get_conn() as c: c.execute('select 1')
    return {'ok': True}


@app.get('/api/config')
def config():
    with get_conn() as conn:
        d = Data(conn)
        codes = engine.factor_codes(d)
        cat = lambda c: dict(code=c, label=engine.label(d, c), name=d.categories[c]['name'], description=d.categories[c]['description'],
                             group=d.categories[c].get('group_name'), scope=d.categories[c].get('entity_scope'), data_hint=d.categories[c].get('data_hint'),
                             builtin=bool(d.categories[c]['is_builtin']))
        active = [c for c in codes if d.weights.get(c, 0) > 0]
        return dict(version=d.config['version'], as_of=str(today()), bands=d.config['band_thresholds'],
                    categories=[cat(c) for c in active], library=[cat(c) for c in codes if c not in active],
                    weights={c: round(d.weights.get(c, 0), 2) for c in codes}, defaults=engine.DEFAULT_WEIGHTS, core=engine.CORE)


@app.post('/api/ranking')
def ranking(req: RankReq):
    _check_entity(req.entity)
    with get_conn() as conn:
        d = Data(conn)
        try:
            res = engine.run(d, req.as_of or today(), req.entity, req.weights)
        except ValueError as e:
            raise HTTPException(400, str(e))
        res['as_of'] = str(req.as_of or today())
        return res


@app.post('/api/evidence')
def evidence(req: EvidenceReq):
    _check_entity(req.entity)
    with get_conn() as conn:
        d = Data(conn)
        return engine.evidence(d, req.as_of or today(), req.entity, req.id)


@app.post('/api/config/apply')
def apply_config(req: ApplyReq):
    with get_conn() as conn:
        try:
            ver, cid, stored = engine.save_configuration(conn, req.weights)
        except ValueError as e:
            raise HTTPException(400, str(e))
        d = Data(conn)
        for ent in ('school', 'teacher'):
            engine.persist_run(conn, d, today(), ent, engine.run(d, today(), ent), cid)
        conn.commit()
        return dict(version=ver, weights=stored)


@app.get('/api/schools/{school_id}/files')
def school_files(school_id: str):
    with get_conn() as conn:
        rows = conn.execute("""select f.*, v.feeds, d.original_filename as duplicate_of_name
                               from source_files f left join v_source_file_feeds v on v.source_file_id = f.id
                               left join source_files d on d.id = f.duplicate_of_file_id
                               where f.school_id = %s order by f.section, f.record_date, f.original_filename""", (school_id,)).fetchall()
        out = []
        for f in rows:
            out.append(dict(id=str(f['id']), name=f['original_filename'], section=f['section'], format=f['file_format'], kind=f['doc_kind'], scanned=f['is_scanned'],
                            record_date=str(f['record_date']), size=f['size_bytes'], status=f['processing_status'], duplicate_of=f['duplicate_of_name'], feeds=f['feeds'] or [],
                            duration=float(f['duration_seconds']) if f['duration_seconds'] else None))
        return out


def _highlights(conn, fid):
    q = """select 'assessment' t, locator, evidence_text, validation_status st from assessments where source_file_id = %(f)s
           union all select 'observation', locator, evidence_text, validation_status from observations where source_file_id = %(f)s
           union all select 'attendance', locator, null, 'valid' from attendance where source_file_id = %(f)s
           union all select 'intervention', locator, null, 'valid' from interventions where source_file_id = %(f)s
           union all select 'follow_up', completion_locator, completion_evidence, 'valid' from follow_ups where completion_source_file_id = %(f)s"""
    return [dict(type=r['t'], locator=r['locator'], text=r['evidence_text'], status=r['st']) for r in conn.execute(q, dict(f=fid)).fetchall() if r['locator'] or r['evidence_text']]


def _file(conn, fid):
    f = conn.execute('select * from source_files where id = %s', (fid,)).fetchone()
    if not f: raise HTTPException(404, 'file not found')
    return f


@app.get('/api/files/{fid}/raw')
def file_raw(fid: str):
    with get_conn() as conn:
        f = _file(conn, fid)
    st = get_storage(os.environ)
    if isinstance(st, LocalStorage):
        p = st.root / f['storage_path']
        if not p.is_file(): raise HTTPException(404, 'file missing in storage')
        return FileResponse(str(p), media_type=f['mime_type'], headers={'Content-Disposition': f'inline; filename="{f["original_filename"]}"'})
    return RedirectResponse(st.signed_url(f['storage_path']))


@app.get('/api/files/{fid}/page/{n}')
def pdf_page(fid: str, n: int):
    import pymupdf
    from fastapi.responses import Response
    with get_conn() as conn:
        f = _file(conn, fid)
    if f['file_format'] != 'pdf': raise HTTPException(400, 'not a pdf')
    doc = pymupdf.open(stream=get_storage(os.environ).get(f['storage_path']), filetype='pdf')
    if n < 1 or n > len(doc): raise HTTPException(404, 'page out of range')
    return Response(doc[n - 1].get_pixmap(dpi=110).tobytes('png'), media_type='image/png', headers={'Cache-Control': 'private, max-age=3600'})


@app.get('/api/files/{fid}/preview')
def file_preview(fid: str):
    with get_conn() as conn:
        f = _file(conn, fid)
        hl = _highlights(conn, fid)
    st = get_storage(os.environ)
    meta = dict(id=str(f['id']), name=f['original_filename'], format=f['file_format'], kind=f['doc_kind'], scanned=f['is_scanned'], highlights=hl)
    fmt = f['file_format']
    if fmt in ('jpg', 'png', 'webp'): return dict(meta, view='image')
    if fmt == 'pdf':
        import pymupdf
        pages = len(pymupdf.open(stream=st.get(f['storage_path']), filetype='pdf'))
        return dict(meta, view='pdf', pages=pages)
    if fmt in ('mp3', 'wav', 'm4a', 'ogg', 'webm', 'aac', 'opus'): return dict(meta, view='audio', transcript=f['extracted_text'])
    data = st.get(f['storage_path'])
    if fmt == 'xlsx':
        wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
        sheets = [dict(name=ws.title, rows=[['' if c is None else str(c) for c in row] for row in ws.iter_rows(values_only=True)][:300]) for ws in wb]
        return dict(meta, view='sheets', sheets=sheets)
    if fmt == 'csv':
        rows = list(csv.reader(io.StringIO(data.decode('utf-8-sig'))))[:300]
        return dict(meta, view='sheets', sheets=[dict(name='CSV', rows=rows)])
    if fmt == 'docx':
        d = Document(io.BytesIO(data))
        paras = [p.text for p in d.paragraphs if p.text.strip()]
        tables = [[[c.text for c in r.cells] for r in t.rows] for t in d.tables]
        return dict(meta, view='doc', paragraphs=paras, tables=tables)
    if fmt in ('txt', 'md'):
        return dict(meta, view='text', text=data.decode('utf-8-sig'))
    raise HTTPException(415, 'no preview for this format')

