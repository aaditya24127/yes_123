"""Bulk upload: receive -> sort -> (CRP confirms) -> import. Used by the Upload page, the visit flow and the teacher link."""
import datetime as dt, hashlib, io, json, re, threading, traceback, zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import PurePosixPath
from . import readers, sorter, importer, newschool
from ... import ai
from ...core.storage import get_storage
from ..prioritization.data import get_conn

MAX_FILE = 200 * 1024 * 1024


def _slug(s): return re.sub(r'[^A-Za-z0-9]+', '_', s).strip('_')[:60]


def _school_folder(conn, school):
    r = conn.execute("select storage_path from source_files where school_id = %s and storage_path like 'data/schools/%%' limit 1", (school['id'],)).fetchone()
    if r: return '/'.join(r['storage_path'].split('/')[:3])
    return f"data/schools/{school['code']}_{_slug(school['name'])}"


def _expand(files):
    """Unpacks .zip uploads; keeps the folder path inside the zip (it often names the school)."""
    out = []
    for name, data in files:
        if name.lower().endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                for info in z.infolist():
                    if info.is_dir() or info.file_size > MAX_FILE or '__MACOSX' in info.filename: continue
                    out.append((info.filename, z.read(info)))
        else:
            out.append((name, data))
    return out


def create_batch(files, origin='crp', created_by=None, hint_school_id=None, hint_teacher_id=None, hint_section=None, note=None):
    st = get_storage()
    with get_conn() as conn:
        schools = conn.execute('select * from schools where is_active').fetchall()
        teachers = conn.execute('select * from teachers where is_active').fetchall()
        bid = conn.execute('insert into upload_batches (origin, created_by, note) values (%s,%s,%s) returning id', (origin, created_by, note)).fetchone()['id']
        seen = {}
        todo = []                                                   # files that need sorting: sorted side by side below (each may ask the AI)
        for i, (path, data) in enumerate(_expand(files)):
            name = PurePosixPath(path.replace('\\', '/')).name
            fmt = readers.format_of(name)
            sha = hashlib.sha256(data).hexdigest()
            key = f'uploads/{bid}/{i:03d}_{_slug(name.rsplit(".", 1)[0])}.{name.rsplit(".", 1)[-1].lower() if "." in name else "bin"}'
            st.put(key, data, readers.MIME.get(fmt or ''))
            row = dict(batch_id=bid, original_filename=name, temp_path=key, size_bytes=len(data), sha256=sha, file_format=fmt or 'other')
            job = None
            if fmt is None:
                row.update(status='skipped', reasons=json.dumps(['This file type is not supported']), confidence=0)
            elif sha in seen:
                row.update(status='duplicate', reasons=json.dumps([f'Same file as {seen[sha]} in this upload']), confidence=1)
            else:
                prev = conn.execute('select id, original_filename from source_files where sha256 = %s limit 1', (sha,)).fetchone()
                job = dict(path=path, name=name, data=data, rr=readers.read(data, name), prev=prev)
            seen.setdefault(sha, name)
            todo.append((row, job))

        def sort_one(job):
            return sorter.sort_file(job['path'], job['rr'], schools, teachers, hint_school_id, hint_teacher_id, data=job['data'])
        jobs_ = [j for _, j in todo if j]
        with ThreadPoolExecutor(max_workers=min(6, max(1, len(jobs_)))) as pool:
            sorted_ = list(pool.map(sort_one, jobs_))
        it = iter(sorted_)
        for row, job in todo:
            if job:
                g = next(it); rr, prev, name = job['rr'], job['prev'], job['name']
                if hint_section: g['section'] = hint_section
                status = 'duplicate' if prev else ('sorted' if g['school_id'] and g['confidence'] >= 0.6 and g['section'] != 'other' else 'needs_attention')
                reasons = g['reasons'] + ([f"Already uploaded before as {prev['original_filename']}"] if prev else [])
                detected = None
                if not g['school_id'] and not prev:                 # no known school: say what we found (a new school, or no school at all)
                    try: detected = newschool.detect(name, rr, g['section'], g['record_date'], schools, teachers, job['data'])
                    except Exception: detected = None
                if detected: row['detected'] = json.dumps(detected)
                row.update(school_id=g['school_id'], teacher_id=g['teacher_id'], section=g['section'], record_date=g['record_date'], doc_kind=g['doc_kind'],
                           confidence=g['confidence'], sorted_by=g['sorted_by'], reasons=json.dumps(reasons), text_preview=(rr.text or rr.note)[:1200],
                           status=status, duplicate_of=prev['id'] if prev else None)
            cols = list(row)
            conn.execute(f"insert into upload_items ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})", [row[c] for c in cols])
        conn.execute("update upload_batches set status = 'ready' where id = %s", (bid,))
        conn.commit()
        later = [r['id'] for r in conn.execute("select id from upload_items where batch_id = %s and detected->>'kind' = 'new_school'", (bid,)).fetchall()]
    if later: threading.Thread(target=lambda: [read_found(str(i)) for i in later], daemon=True).start()      # read them while the CRP looks at the list
    return str(bid)


def batch_view(batch_id):
    with get_conn() as conn:
        b = conn.execute('select * from upload_batches where id = %s', (batch_id,)).fetchone()
        if not b: return None
        items = conn.execute("""select u.*, s.name as school_name, s.code as school_code, t.full_name as teacher_name
                                from upload_items u left join schools s on s.id = u.school_id left join teachers t on t.id = u.teacher_id
                                where u.batch_id = %s order by u.created_at, u.original_filename""", (batch_id,)).fetchall()
    out = []
    for u in items:
        out.append(dict(id=str(u['id']), name=u['original_filename'], format=u['file_format'], size=u['size_bytes'], school_id=str(u['school_id']) if u['school_id'] else None,
                        school_name=u['school_name'], school_code=u['school_code'], teacher_id=str(u['teacher_id']) if u['teacher_id'] else None, teacher_name=u['teacher_name'],
                        section=u['section'], record_date=str(u['record_date']) if u['record_date'] else None, kind=u['doc_kind'], confidence=float(u['confidence']),
                        sorted_by=u['sorted_by'], reasons=u['reasons'], preview=u['text_preview'], status=u['status'], result=u['result'], error=u['error'],
                        source_file_id=str(u['source_file_id']) if u['source_file_id'] else None, detected=u.get('detected')))
    counts = {}
    for i in out: counts[i['status']] = counts.get(i['status'], 0) + 1
    return dict(id=str(b['id']), status=b['status'], origin=b['origin'], created_at=b['created_at'].isoformat(), counts=counts, items=out)


def update_item(item_id, **changes):
    allowed = {'school_id', 'teacher_id', 'section', 'record_date', 'status'}
    sets = {k: v for k, v in changes.items() if k in allowed}
    if 'status' in sets and sets['status'] not in ('sorted', 'skipped', 'needs_attention'): raise ValueError('bad status')
    with get_conn() as conn:
        u = conn.execute('select * from upload_items where id = %s', (item_id,)).fetchone()
        if not u or u['status'] in ('imported',): raise ValueError('This file is already imported')
        if sets:
            if 'status' not in sets and u['status'] in ('needs_attention', 'duplicate'):
                merged = {**u, **sets}
                if merged['school_id'] and merged['section'] and merged['section'] != 'other': sets['status'] = 'sorted'
            sets['sorted_by'] = 'crp'; sets['confidence'] = 1
            conn.execute(f"update upload_items set {', '.join(f'{k} = %s' for k in sets)} where id = %s", [*sets.values(), item_id])
            conn.commit()


def start_import(batch_id):
    """Queues one background job per confirmed file (any number of workers can share them; see app/jobs.py)."""
    from ...jobs import enqueue
    with get_conn() as conn:
        items = conn.execute("update upload_items set status = 'importing' where batch_id = %s and status = 'sorted' returning id", (batch_id,)).fetchall()
        conn.execute("update upload_batches set status = %s where id = %s", ('importing' if items else 'done', batch_id))
        for it in items:
            enqueue('import_item', {'item_id': str(it['id']), 'batch_id': str(batch_id)}, conn=conn)
        conn.commit()
    return len(items)


def run_import_job(meta):
    """Job handler: import one file, then close the batch when its last file is done."""
    with get_conn() as conn:
        u = conn.execute('select * from upload_items where id = %s', (meta['item_id'],)).fetchone()
    if not u or u['status'] != 'importing': return None
    try:
        sf, res, _ = import_item(u)
        provider = res.get('read_by')
    except Exception as e:
        traceback.print_exc()
        with get_conn() as conn:
            conn.execute("update upload_items set status = 'failed', error = %s where id = %s", (str(e)[:500], u['id'])); conn.commit()
        provider = None
    with get_conn() as conn:
        left = conn.execute("select count(*) as n from upload_items where batch_id = %s and status = 'importing'", (u['batch_id'],)).fetchone()['n']
        if not left: conn.execute("update upload_batches set status = 'done' where id = %s", (u['batch_id'],))
        conn.commit()
    return provider


def import_item(u, st=None, session_section=None):
    """Imports one sorted upload item. Returns (source_file_id, result dict, transcript or None)."""
    st = st or get_storage()
    data = st.get(u['temp_path'])
    rr = readers.read(data, u['original_filename'])
    with get_conn() as conn:
        school = conn.execute('select * from schools where id = %s', (u['school_id'],)).fetchone()
        teachers = conn.execute('select * from teachers where school_id = %s and is_active', (u['school_id'],)).fetchall()
        teacher = next((t for t in teachers if t['id'] == u['teacher_id']), None)
        section = session_section or u['section']
        date = u['record_date'] or dt.date.today()
        final = f"{_school_folder(conn, school)}/{section}/{date:%Y-%m-%d}_{u['original_filename']}"
        n = 1
        while conn.execute('select 1 from source_files where storage_path = %s', (final,)).fetchone():
            n += 1; base, _, ext = u['original_filename'].rpartition('.'); final = f"{_school_folder(conn, school)}/{section}/{date:%Y-%m-%d}_{base} ({n}).{ext}"
    st.put(final, data, readers.MIME.get(u['file_format']))
    transcript, note = None, None
    if rr.fmt in readers.AUDIO:
        transcript, note = transcribe(data, u['original_filename'])
    text = rr.text or (transcript['text'] if transcript else '')
    with get_conn() as conn:
        sf = conn.execute("""insert into source_files (school_id, teacher_id, section, original_filename, storage_path, mime_type, file_format, size_bytes, sha256, doc_kind,
                             is_scanned, record_date, processing_status, duplicate_of_file_id, extracted_text, batch_id, duration_seconds, notes)
                             values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'processing',%s,%s,%s,%s,%s) returning id""",
                          (school['id'], teacher['id'] if teacher else None, section, u['original_filename'], final, readers.MIME.get(u['file_format']),
                           u['file_format'], u['size_bytes'], u['sha256'], u['doc_kind'] or rr.kind, rr.scanned, u['record_date'], u['duplicate_of'], text[:200000] or None,
                           u['batch_id'], rr.duration, note)).fetchone()['id']
        ctx = dict(school=school, teachers=teachers, teacher=teacher, section=section, filename=u['original_filename'], record_date=u['record_date'],
                   all_schools=conn.execute('select * from schools where is_active').fetchall())
        res = importer.extract_and_write(conn, u, sf, school, teachers, rr, data, ctx, transcript) if section not in ('visit_session',) else dict(counts={}, warnings=[], read_by='none')
        if note: res['warnings'].insert(0, note)
        if transcript: res['transcribed_by'] = transcript['by']
        review = any(k.endswith(('_needs_review', '_conflict', '_invalid')) for k in res['counts'])
        conn.execute("update source_files set processing_status = %s where id = %s", ('awaiting_review' if review else 'validated', sf))
        conn.execute("update upload_items set status = 'imported', source_file_id = %s, result = %s, error = null where id = %s",
                     (sf, json.dumps(res, default=str), u['id']))
        conn.commit()
    return sf, res, transcript


def transcribe(data, filename):
    """(transcript dict with 'by', None) or (None, reason). Which speech-to-text runs is decided in config/ai.json."""
    try:
        r = ai.run('transcribe', {}, [ai.Attachment(filename, readers.MIME.get(readers.format_of(filename) or '', 'audio/mpeg'), data)])
        return dict(r.data, by=r.model or r.provider), None
    except ai.AIUnavailable:
        return None, 'Not transcribed: no speech-to-text available'


def add_detected_school(item_id, school=None, teacher_names=None, crp_code=None):
    """The CRP chose "Add school and data" on a New school detected file: creates the school (and the chosen teachers), puts the CRP in
    charge of it and files the upload under it, ready to import."""
    school = school or {}
    with get_conn() as conn:
        u = conn.execute('select * from upload_items where id = %s', (item_id,)).fetchone()
        if not u or u['status'] in ('imported', 'importing'): raise ValueError('This file is already imported')
        d = u['detected'] or {}
        info = {**(d.get('school') or {}), **{k: v for k, v in school.items() if v not in (None, '')}}
        name = re.sub(r'\s+', ' ', str(info.get('name') or '')).strip()
        if len(name) < 3: raise ValueError('Please type the school name')
        gf, gt = int(info.get('grade_from') or 1), int(info.get('grade_to') or 10)
        if not (1 <= gf <= gt <= 12): raise ValueError('Classes must be between 1 and 12, first class before last')
        old = conn.execute('select id from schools where lower(name) = lower(%s) and is_active', (name,)).fetchone()
        if old: sid = old['id']
        else:
            n = 1 + max([int(m.group(1)) for r in conn.execute("select code from schools").fetchall() if (m := re.fullmatch(r'S(\d+)', r['code']))] or [0])
            code = f'S{n:02d}'
            sid = conn.execute("""insert into schools (code, name, school_type, board, medium, grade_from, grade_to, village, taluka, district, cluster)
                                  values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                               (code, name, info.get('school_type') or 'Not stated', info.get('board') or 'Not stated', info.get('medium') or 'Not stated', gf, gt,
                                '', '', '', '')).fetchone()['id']
            crp = conn.execute('select id from crps order by created_at limit 1').fetchone()
            if crp: conn.execute('insert into school_assignments (crp_id, school_id, assigned_on) values (%s,%s,current_date) on conflict do nothing', (crp['id'], sid))
        sch = conn.execute('select * from schools where id = %s', (sid,)).fetchone()
        added = 0
        for full in (teacher_names if teacher_names is not None else (d.get('teachers') or [])):
            m = re.match(r'^(Mr|Mrs|Ms|Miss|Dr|Smt|Shri)\.?\s+(.*)$', full.strip())
            title, clean = (m.group(1) + '.', m.group(2).strip()) if m else (None, full.strip())
            if len(clean) < 2 or conn.execute('select 1 from teachers where school_id = %s and lower(full_name) = lower(%s)', (sid, clean)).fetchone(): continue
            k = conn.execute('select count(*) as n from teachers where school_id = %s', (sid,)).fetchone()['n'] + 1
            code = f"{sch['code']}-T{k:02d}"
            while conn.execute('select 1 from teachers where teacher_code = %s', (code,)).fetchone(): k += 1; code = f"{sch['code']}-T{k:02d}"
            conn.execute('insert into teachers (school_id, teacher_code, full_name, title) values (%s,%s,%s,%s)', (sid, code, clean, title)); added += 1
        status = 'sorted' if u['section'] and u['section'] != 'other' else 'needs_attention'
        conn.execute("update upload_items set school_id = %s, status = %s, detected = null, sorted_by = 'crp', confidence = 1 where id = %s", (sid, status, item_id))
        conn.commit()
    return dict(school_id=str(sid), school_name=sch['name'], teachers_added=added, status=status)


_reading: dict[str, threading.Lock] = {}


def read_found(item_id):
    """Reads what is inside a New school file (notes, actions, test results, teachers) the way Import will, and keeps it with the item.
    Runs in the background after upload and again, if needed, when the CRP opens View details; one read per file."""
    from . import newschool
    lock = _reading.setdefault(item_id, threading.Lock())
    with lock:
        with get_conn() as conn:
            u = conn.execute('select * from upload_items where id = %s', (item_id,)).fetchone()
            if not u or not u['detected'] or u['detected'].get('kind') != 'new_school': return u['detected'] if u else None
            d = u['detected']
            if (d.get('data') or {}).get('found'): return d
            teachers = conn.execute('select * from teachers where is_active').fetchall()
        st = get_storage()
        data = st.get(u['temp_path']) if st.exists(u['temp_path']) else b''
        rr = readers.read(data, u['original_filename']) if data else None
        found = newschool.read_data(rr, data, u['original_filename'], u['section'], u['record_date'], d['school']['name'], teachers) if rr else dict(by='rules', notes=[])
        d = {**d, 'teachers': newschool.merge_teachers(d.get('teachers') or [], found.pop('teachers', [])), 'data': {**(d.get('data') or {}), 'found': found}}
        with get_conn() as conn:
            conn.execute('update upload_items set detected = %s where id = %s and detected is not null', (json.dumps(d), item_id)); conn.commit()
        return d
