"""Which function runs each kind of background job. Add a new job type here (and to the processing_jobs check constraint)."""
from .jobs import handler
from .services.ingest import pipeline
from .services import textbooks, visit
from .services.prioritization.data import get_conn


@handler('import_item')
def _import(meta, job):
    return pipeline.run_import_job(meta)


@handler('fetch_textbook')
def _textbook(meta, job):
    return textbooks.fetch(meta['resource_id'])


@handler('evaluate_session')
def _evaluate(meta, job):
    try:
        return visit.evaluate(meta['session_id'])
    except Exception as e:
        with get_conn() as c:
            c.execute("update visit_sessions set result = jsonb_build_object('error', %s::text) where id = %s and status = 'in_progress'", (str(e)[:300], meta['session_id']))
            c.commit()
        raise


@handler('transcribe_media')
def _transcribe(meta, job):
    from .core.storage import get_storage
    with get_conn() as c:
        m = c.execute('select m.id, f.storage_path, f.original_filename, m.source_file_id from session_media m join source_files f on f.id = m.source_file_id where m.id = %s',
                      (meta['media_id'],)).fetchone()
    if not m: return None
    tr, note = pipeline.transcribe(get_storage().get(m['storage_path']), m['original_filename'])
    with get_conn() as c:
        if tr:
            text = '\n'.join(f"[{int(x['start'] // 60):02d}:{int(x['start'] % 60):02d}] {x['text']}" for x in tr['segments']) or tr['text']
            c.execute('update session_media set transcript = %s, transcript_by = %s where id = %s', (text, tr['by'], m['id']))
            c.execute('update source_files set extracted_text = %s where id = %s', (text, m['source_file_id']))
        else:
            c.execute('update session_media set transcript_by = %s where id = %s', (note, m['id']))
        c.commit()
    return tr['by'] if tr else None
