"""Background job queue on the database (processing_jobs). Slow work (imports, transcription, lesson evaluation, textbook
downloads) goes here so the website stays fast.

Scaling: start more workers, on this or other machines, all pointing at the same database:
    backend\\.venv\\Scripts\\python -m app.jobs            (from the backend folder)
Each job is taken by exactly one worker ("for update skip locked"). The API also runs WORKERS_IN_API worker threads
itself (default 1) so a single computer needs nothing extra.
"""
import json, os, socket, threading, time, traceback
import datetime as dt

from .services.prioritization.data import get_conn

HANDLERS = {}


def handler(job_type):
    def deco(fn):
        HANDLERS[job_type] = fn; return fn
    return deco


def enqueue(job_type, meta, source_file_id=None, conn=None):
    sql = 'insert into processing_jobs (job_type, meta, source_file_id) values (%s, %s, %s) returning id'
    if conn is not None:
        return str(conn.execute(sql, (job_type, json.dumps(meta, default=str), source_file_id)).fetchone()['id'])
    with get_conn() as c:
        jid = c.execute(sql, (job_type, json.dumps(meta, default=str), source_file_id)).fetchone()['id']; c.commit()
        return str(jid)


def job_status(job_id):
    with get_conn() as c:
        j = c.execute('select id, job_type, status, progress_pct, error, provider, meta, created_at, finished_at from processing_jobs where id = %s', (job_id,)).fetchone()
    return None if not j else dict(j, id=str(j['id']))


def _take(worker):
    with get_conn() as c:
        j = c.execute("""update processing_jobs set status = 'processing', started_at = now(), attempts = attempts + 1, locked_by = %s
                         where id = (select id from processing_jobs where status = 'queued' and run_after <= now() and job_type = any(%s)
                                     order by created_at for update skip locked limit 1) returning *""", (worker, list(HANDLERS))).fetchone()
        c.commit()
        return j


def _finish(job, ok, err=None, provider=None):
    with get_conn() as c:
        if ok:
            c.execute("update processing_jobs set status = 'completed', progress_pct = 100, finished_at = now(), provider = coalesce(%s, provider) where id = %s",
                      (provider, job['id']))
        elif job['attempts'] < int(os.environ.get('JOB_MAX_ATTEMPTS', 3)):
            c.execute("update processing_jobs set status = 'queued', error = %s, run_after = now() + interval '30 seconds' * attempts where id = %s", (err, job['id']))
        else:
            c.execute("update processing_jobs set status = 'failed', error = %s, finished_at = now() where id = %s", (err, job['id']))
        c.commit()


def work_once(worker='api'):
    job = _take(worker)
    if not job: return False
    try:
        provider = HANDLERS[job['job_type']](job['meta'] or {}, job)
        _finish(job, True, provider=provider if isinstance(provider, str) else None)
    except Exception as e:
        traceback.print_exc()
        _finish(job, False, f'{e.__class__.__name__}: {e}'[:800])
    return True


def run_forever(worker=None, idle=1.5, stop=None):
    worker = worker or f'{socket.gethostname()}:{os.getpid()}:{threading.get_ident()}'
    # jobs left "processing" by a crashed worker go back to the queue after 30 minutes
    with get_conn() as c:
        c.execute("update processing_jobs set status = 'queued' where status = 'processing' and started_at < now() - interval '30 minutes'"); c.commit()
    while not (stop and stop.is_set()):
        try:
            if not work_once(worker): time.sleep(idle)
        except Exception:
            traceback.print_exc(); time.sleep(5)


def start_in_api():
    from . import job_handlers   # noqa: F401  (registers handlers)
    n = int(os.environ.get('WORKERS_IN_API', '1'))
    for k in range(n):
        threading.Thread(target=run_forever, kwargs=dict(worker=f'api-{os.getpid()}-{k}'), daemon=True).start()


if __name__ == '__main__':
    from pathlib import Path
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / '.env')
    from . import job_handlers   # noqa: F401
    print('worker started; press Ctrl+C to stop')
    run_forever()
