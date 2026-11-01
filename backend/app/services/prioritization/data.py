"""Loads everything the engine needs from PostgreSQL into plain dicts."""
import atexit
import datetime as dt
import os
import threading
import psycopg
from psycopg.rows import dict_row


_pools, _lock = {}, threading.Lock()


def get_conn():
    """A database connection from a small pool, used as:  with get_conn() as conn: ...
    The pool keeps connections open, so a request does not pay for a new connection (about half a second to a hosted database)
    every time. On leaving the block the work is committed (rolled back on an error) and the connection goes back to the pool."""
    from ...core.settings import database_url
    url = database_url()
    pool = _pools.get(url)
    if pool is None:
        with _lock:
            pool = _pools.get(url)
            if pool is None:
                from psycopg_pool import ConnectionPool
                pool = _pools[url] = ConnectionPool(url, kwargs={'row_factory': dict_row}, min_size=1, max_size=int(os.environ.get('DB_POOL_MAX', 8)), max_idle=240, max_lifetime=1500,
                                                    timeout=30, check=ConnectionPool.check_connection, open=True, name='crp-db')
    return pool.connection()


@atexit.register
def _close_pools():
    for p in list(_pools.values()):
        try: p.close(timeout=1)
        except Exception: pass


QUERIES = dict(
    schools='select * from schools where is_active order by code',
    teachers='select * from teachers where is_active order by teacher_code',
    assessments='select * from assessments',
    observations='select * from observations',
    visits='select * from visits',
    follow_ups="""select f.*, i.approved_action as action, i.responsible, i.observation_id, i.source_file_id as plan_file_id, i.locator as plan_locator
                  from follow_ups f left join interventions i on i.id = f.intervention_id""",
    interventions='select * from interventions',
    files='select * from source_files',
    categories='select * from priority_categories',
    config="select * from priority_configurations where status = 'active'",
    weights="""select c.code, w.weight from priority_config_weights w join priority_categories c on c.id = w.category_id
               where w.config_id = (select id from priority_configurations where status = 'active' limit 1)""",
    attendance='select * from attendance order by month',
    facts="select * from facts where validation_status <> 'invalid' order by as_of_date, created_at",
    overrides='select * from priority_overrides where active order by created_at',
)


class Data:
    def __init__(self, conn):
        # All the tables are asked for in one go (one trip to the database instead of fourteen).
        with conn.pipeline():
            cur = {k: conn.execute(sql) for k, sql in QUERIES.items()}
        r = {k: c.fetchall() for k, c in cur.items()}
        self.schools, self.teachers = r['schools'], r['teachers']
        self.assessments, self.observations, self.visits = r['assessments'], r['observations'], r['visits']
        self.follow_ups, self.interventions = r['follow_ups'], r['interventions']
        self.files = {f['id']: f for f in r['files']}
        self.categories = {c['code']: c for c in r['categories']}
        self.config = r['config'][0] if r['config'] else None
        self.weights = {w['code']: float(w['weight']) for w in r['weights']}
        self.school_by_id = {s['id']: s for s in self.schools}
        self.teacher_by_id = {t['id']: t for t in self.teachers}
        self.teachers_by_school = {}
        for t in self.teachers:
            self.teachers_by_school.setdefault(t['school_id'], []).append(t)
        self.attendance_by_school = {}
        for a in r['attendance']:
            a['month_date'] = dt.date.fromisoformat(a['month'] + '-01')
            self.attendance_by_school.setdefault(a['school_id'], []).append(a)
        # Latest valid value per (school, key) and (teacher, key).
        self.school_facts, self.teacher_facts, self.fact_by_id = {}, {}, {}
        for f in r['facts']:
            self.fact_by_id[f['id']] = f
            if f['teacher_id']: self.teacher_facts.setdefault(f['teacher_id'], {})[f['fact_key']] = f
            else: self.school_facts.setdefault(f['school_id'], {})[f['fact_key']] = f
        today = dt.date.today()
        self.overrides = {}
        for o in r['overrides']:
            if o['expires_on'] and o['expires_on'] < today: continue
            self.overrides[(o['entity_type'], str(o['teacher_id'] if o['entity_type'] == 'teacher' else o['school_id']))] = o
