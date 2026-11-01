"""Numbered tasks inside a request ("Task 1, Task 2 ..."): loading them with their files, and keeping the request's status in step.

An item goes  open -> submitted (teacher sent files / a note) -> accepted | rejected (CRP review; rejected needs remarks and the teacher can send again).
"""

# Where an accepted item's files can be added in the records. These are the sections the upload sorting and importer already understand.
ADD_TO = [
    ('assessments', 'Student marks / test results'),
    ('attendance', 'Attendance'),
    ('observations', 'Classroom notes and observations'),
    ('followups', 'Follow-up actions'),
    ('visits', 'Visit records'),
    ('audio', 'Lesson recording (transcribed into notes)'),
    ('roster', 'Teacher / staff list'),
    ('facts', 'School numbers (enrolment, girls, special needs ...)'),
    ('textbooks', 'Syllabus or lesson plan (kept as a file)'),
    ('other', 'Keep the file only (no records are created)'),
]
ADD_SECTIONS = {k for k, _ in ADD_TO}


def _s(x): return None if x is None else str(x)


def items_by_request(conn, request_ids):
    """{request_id: [item, ...]} with each item's files (what the teacher sent for it)."""
    ids = [str(i) for i in request_ids]
    if not ids: return {}
    items = conn.execute('select * from task_items where request_id = any(%s::uuid[]) order by request_id, position', (ids,)).fetchall()
    files = conn.execute("""select b.task_item_id, u.id, u.original_filename, u.size_bytes, u.file_format, u.status, u.created_at
                            from upload_batches b join upload_items u on u.batch_id = b.id
                            where b.task_item_id = any(%s::uuid[]) order by u.created_at""", ([str(i['id']) for i in items],)).fetchall() if items else []
    by_item = {}
    for f in files:
        by_item.setdefault(str(f['task_item_id']), []).append(dict(id=str(f['id']), name=f['original_filename'], size=f['size_bytes'], format=f['file_format'],
                                                                   status=f['status'], created_at=f['created_at'].isoformat()))
    out = {}
    for i in items:
        out.setdefault(str(i['request_id']), []).append(dict(
            id=str(i['id']), position=i['position'], title=i['title'], instructions=i['instructions'], kind=i['kind'], status=i['status'],
            response_text=i['response_text'], review_remark=i['review_remark'], added_to=i['added_to'],
            submitted_at=i['submitted_at'].isoformat() if i['submitted_at'] else None, reviewed_at=i['reviewed_at'].isoformat() if i['reviewed_at'] else None,
            files=by_item.get(str(i['id']), [])))
    return out


def refresh_request(conn, request_id):
    """Request status follows its items: anything waiting for review = submitted; all accepted = accepted; otherwise open."""
    st = [r['status'] for r in conn.execute('select status from task_items where request_id = %s', (request_id,)).fetchall()]
    if not st: return
    new = 'submitted' if 'submitted' in st else 'accepted' if all(s == 'accepted' for s in st) else 'open'
    conn.execute("update teacher_requests set status = %s, responded_at = case when %s = 'open' then responded_at else now() end where id = %s and status <> 'cancelled'",
                 (new, new, request_id))
