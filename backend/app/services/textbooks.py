"""Textbooks and syllabus linked to a teacher and school ("remembered" in teaching_resources).

The CRP searches, clicks Add, and the app downloads the PDF straight from the official site (no manual download and
re-upload). The chapter list and the first part of the text are kept so the AI can refer to the right chapter.
"""
import hashlib, re, urllib.parse

import httpx

from .. import ai
from ..core.storage import get_storage
from .prioritization.data import get_conn

MAX_PDF = 80 * 1024 * 1024


def search(query, class_no=None, subject=None, board=None, language=None):
    r = ai.run('find_textbooks', dict(query=query, class_no=class_no, subject=subject, board=board, language=language))
    seen, out = set(), []
    for x in r.data['results']:
        if not x['url'].startswith(('http://', 'https://')) or x['url'] in seen: continue
        seen.add(x['url']); out.append(x)
    return dict(results=out, found_by=r.provider)


def add(school_id, teacher_id, url, title, class_no=None, subject=None, publisher=None, kind='textbook', added_by=None):
    from ..jobs import enqueue
    with get_conn() as conn:
        rid = conn.execute("""insert into teaching_resources (school_id, teacher_id, class_no, subject, title, source_url, publisher, kind, added_by)
                              values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                           (school_id, teacher_id, class_no, subject, title, url, publisher or urllib.parse.urlparse(url).netloc, kind, added_by)).fetchone()['id']
        enqueue('fetch_textbook', {'resource_id': str(rid)}, conn=conn)
        conn.commit()
    return str(rid)


def fetch(resource_id):
    """Job handler: download the PDF (if the link is a PDF), keep a copy, read chapters and opening text."""
    import pymupdf
    with get_conn() as conn:
        r = conn.execute('select t.*, s.code, s.name as school_name from teaching_resources t join schools s on s.id = t.school_id where t.id = %s', (resource_id,)).fetchone()
    if not r or not r['source_url']: return None
    try:
        with httpx.stream('GET', r['source_url'], follow_redirects=True, timeout=60, headers={'User-Agent': 'Mozilla/5.0 (CRP Mentor Copilot)'}) as resp:
            ctype = resp.headers.get('content-type', '')
            if resp.status_code != 200 or ('pdf' not in ctype and not r['source_url'].lower().split('?')[0].endswith('.pdf')):
                _mark(resource_id, 'linked', None, None, [], None); return None      # a web page, not a PDF: keep it as a link
            data = b''
            for chunk in resp.iter_bytes():
                data += chunk
                if len(data) > MAX_PDF: raise ValueError('PDF is larger than 80 MB')
    except (httpx.HTTPError, ValueError) as e:
        _mark(resource_id, 'failed', None, None, [], f'Download failed: {e}'); return None
    doc = pymupdf.open(stream=data, filetype='pdf')
    toc = [dict(level=l, title=t.strip(), page=p) for l, t, p in doc.get_toc()][:200]
    if not toc:   # no bookmarks: guess chapters from lines like "Chapter 3" / "3. Title" on the first pages
        for i, page in enumerate(list(doc)[:12], 1):
            for line in page.get_text('text').splitlines():
                if re.match(r'^\s*(chapter|unit|lesson|पाठ|धडा)\s*\d+', line, re.I): toc.append(dict(level=1, title=line.strip()[:120], page=i))
    text = '\n'.join(p.get_text('text') for p in list(doc)[:30])[:30000]
    fname = re.sub(r'[^A-Za-z0-9._-]+', '_', urllib.parse.urlparse(r['source_url']).path.rsplit('/', 1)[-1] or 'textbook.pdf')
    if not fname.lower().endswith('.pdf'): fname += '.pdf'
    sha = hashlib.sha256(data).hexdigest()
    with get_conn() as conn:
        folder = conn.execute("select storage_path from source_files where school_id = %s and storage_path like 'data/schools/%%' limit 1", (r['school_id'],)).fetchone()
        base = '/'.join(folder['storage_path'].split('/')[:3]) if folder else f"data/schools/{r['code']}_{re.sub(r'[^A-Za-z0-9]+', '_', r['school_name'])}"
        key = f"{base}/textbooks/{sha[:10]}_{fname}"
        sf = conn.execute('select id from source_files where sha256 = %s and section = %s and school_id = %s', (sha, 'textbooks', r['school_id'])).fetchone()
        if not sf:
            get_storage().put(key, data, 'application/pdf')
            sf = conn.execute("""insert into source_files (school_id, teacher_id, section, original_filename, storage_path, mime_type, file_format, size_bytes, sha256, doc_kind,
                                 processing_status, extracted_text, notes) values (%s,%s,'textbooks',%s,%s,'application/pdf','pdf',%s,%s,'narrative','validated',%s,%s) returning id""",
                              (r['school_id'], r['teacher_id'], fname, key, len(data), sha, text, f"From {r['source_url']}")).fetchone()
        conn.commit()
    _mark(resource_id, 'downloaded', sf['id'], len(doc), toc, text[:12000])
    return 'download'


def _mark(rid, status, sf, pages, toc, text):
    import json
    with get_conn() as conn:
        conn.execute('update teaching_resources set status = %s, source_file_id = coalesce(%s, source_file_id), pages = %s, contents = %s, text_excerpt = coalesce(%s, text_excerpt) where id = %s',
                     (status, sf, pages, json.dumps(toc), text, rid))
        conn.commit()


def list_for(teacher_id=None, school_id=None):
    with get_conn() as conn:
        rows = conn.execute("""select id, school_id, teacher_id, class_no, subject, title, source_url, publisher, kind, source_file_id, pages, contents, status, created_at
                               from teaching_resources where (%s::uuid is not null and teacher_id = %s) or (%s::uuid is not null and school_id = %s)
                               order by created_at desc""", (teacher_id, teacher_id, school_id, school_id)).fetchall()
    return [dict(r, id=str(r['id']), school_id=str(r['school_id']), teacher_id=str(r['teacher_id']) if r['teacher_id'] else None,
                 source_file_id=str(r['source_file_id']) if r['source_file_id'] else None, chapters=len(r['contents'] or []), created_at=r['created_at'].isoformat()) for r in rows]
