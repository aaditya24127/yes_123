"""Database CLI: migrate | seed | storage-sync | verify | reset | status.

Works against any PostgreSQL (local or Supabase). Target is chosen only by environment variables (.env):
  DATABASE_URL      postgresql://user:pass@host:port/dbname
  TARGET            local (default) | supabase   -> supabase also applies *.supabase.sql migrations (RLS)
  STORAGE_BACKEND   local | supabase             (see backend/app/core/storage.py)
"""
import argparse, csv, datetime as dt, hashlib, os, sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
import psycopg
from app.core.storage import get_storage

load_dotenv(ROOT / '.env')
MIGRATIONS = ROOT / 'database' / 'migrations'
SEED = ROOT / 'database' / 'seed_data'
# parents before children
SEED_ORDER = [('crps.csv', 'crps'), ('schools.csv', 'schools'), ('school_assignments.csv', 'school_assignments'), ('teachers.csv', 'teachers'),
              ('source_files.csv', 'source_files'), ('visits.csv', 'visits'), ('assessments.csv', 'assessments'), ('observations.csv', 'observations'),
              ('interventions.csv', 'interventions'), ('follow_ups.csv', 'follow_ups'), ('attendance.csv', 'attendance')]


def connect():
    url = os.environ.get('DATABASE_URL')
    if not url: sys.exit('DATABASE_URL is not set (copy .env.example to .env)')
    return psycopg.connect(url)


def migrate(conn, target):
    with conn.cursor() as cur:
        cur.execute('create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())')
        conn.commit()
        cur.execute('select filename from schema_migrations'); done = {r[0] for r in cur.fetchall()}
    for f in sorted(MIGRATIONS.glob('*.sql')):
        if f.name.endswith('.supabase.sql') and target != 'supabase':
            print(f'skip   {f.name} (Supabase only)'); continue
        if f.name in done:
            print(f'done   {f.name}'); continue
        with conn.transaction(), conn.cursor() as cur:
            cur.execute(f.read_text(encoding='utf-8-sig'))
            cur.execute('insert into schema_migrations (filename) values (%s)', (f.name,))
        print(f'apply  {f.name}')


def col_types(cur, table):
    cur.execute("select column_name, data_type, udt_name from information_schema.columns where table_schema = 'public' and table_name = %s", (table,))
    return {r[0]: (r[1], r[2]) for r in cur.fetchall()}


def conv(v, dtype, udt):
    if v == '' or v is None: return None
    if dtype == 'boolean': return v.lower() == 'true'
    if dtype in ('smallint', 'integer', 'bigint'): return int(v)
    if dtype == 'numeric': return Decimal(v)
    if dtype == 'date': return dt.date.fromisoformat(v)
    if dtype == 'timestamp with time zone': return dt.datetime.fromisoformat(v)
    if dtype == 'ARRAY': return [int(x) for x in v.split(';')] if udt in ('_int2', '_int4', '_int8') else v.split(';')
    return v


def seed(conn):
    with conn.transaction(), conn.cursor() as cur:
        cur.execute('set constraints all deferred')
        for fname, table in SEED_ORDER:
            types = col_types(cur, table)
            with open(SEED / fname, encoding='utf-8', newline='') as fh:
                rows = list(csv.DictReader(fh))
            cols = list(rows[0].keys())
            unknown = [c for c in cols if c not in types]
            if unknown: sys.exit(f'{fname}: columns not in table {table}: {unknown}')
            upd = ', '.join(f'{c} = excluded.{c}' for c in cols if c != 'id')
            sql = f'insert into {table} ({", ".join(cols)}) values ({", ".join(["%s"] * len(cols))}) on conflict (id) do update set {upd}'
            cur.executemany(sql, [[conv(r[c], *types[c]) for c in cols] for r in rows])
            print(f'seeded {table:20s} {len(rows):4d} rows')


def storage_sync(conn, dry=False):
    st = get_storage(os.environ)
    with conn.cursor() as cur:
        cur.execute('select storage_path, sha256, mime_type from source_files order by storage_path'); files = cur.fetchall()
    bad = up = ok = 0
    for key, sha, mime in files:
        p = ROOT / key
        if not p.is_file(): print('MISSING on disk:', key); bad += 1; continue
        data = p.read_bytes()
        if hashlib.sha256(data).hexdigest() != sha: print('HASH MISMATCH:', key); bad += 1; continue
        if st.name == 'local':
            ok += 1; continue
        if dry: ok += 1; continue
        if not st.exists(key): st.put(key, data, mime); up += 1
        else: ok += 1
    print(f'storage={st.name}: {len(files)} files, {up} uploaded, {ok} already present/verified, {bad} problems')
    return bad == 0


def verify(conn):
    problems = 0
    with conn.cursor() as cur:
        for fname, table in SEED_ORDER:
            n = sum(1 for _ in open(SEED / fname, encoding='utf-8')) - 1
            cur.execute(f'select count(*) from {table}'); got = cur.fetchone()[0]
            flag = 'ok ' if got >= n else 'BAD'
            problems += got < n
            print(f'{flag} {table:20s} csv={n:4d} db={got:4d}')
        for q, label in [("select count(*) from source_files f where not exists (select 1 from priority_categories limit 0)", None)]:
            pass
        cur.execute("select count(*) from teachers where cardinality(classes_taught) = 0 and school_id is not null"); print('teachers without classes:', cur.fetchone()[0])
        cur.execute("select count(*) from priority_configurations where status = 'active'"); a = cur.fetchone()[0]; print('active priority configurations:', a); problems += a != 1
        cur.execute("select coalesce(sum(weight),0) from priority_config_weights w join priority_configurations c on c.id = w.config_id where c.status = 'active'")
        s = cur.fetchone()[0]; print('active weights total:', s); problems += s != 100
        cur.execute("""select s.code, count(f.*) files, count(*) filter (where f.is_scanned) scanned, count(*) filter (where f.doc_kind = 'audio') audio
                       from schools s left join source_files f on f.school_id = s.id group by s.code order by s.code""")
        print('school  files scanned audio')
        for r in cur.fetchall(): print(f'{r[0]:6s} {r[1]:5d} {r[2]:7d} {r[3]:5d}')
        cur.execute("""select f.original_filename, v.feeds from v_source_file_feeds v join source_files f on f.id = v.source_file_id
                       where f.school_id = (select id from schools where code = 'S07') order by f.record_date, f.original_filename""")
        print('S07 files -> categories fed:')
        for r in cur.fetchall(): print('  ', r[0], '->', r[1])
    files_ok = storage_sync(conn, dry=True)
    print('verify:', 'OK' if not problems and files_ok else f'{problems} problem(s)')
    return not problems and files_ok


def reset(conn):
    with conn.cursor() as cur:
        cur.execute('drop schema public cascade; create schema public;')
    conn.commit(); print('schema public dropped and recreated')


def status(conn):
    with conn.cursor() as cur:
        cur.execute('select to_regclass(\'schema_migrations\')')
        if cur.fetchone()[0] is None: print('no migrations applied yet'); return
        cur.execute('select filename, applied_at from schema_migrations order by filename')
        for r in cur.fetchall(): print(r[0], r[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['migrate', 'seed', 'storage-sync', 'verify', 'reset', 'status', 'setup'])
    ap.add_argument('--yes', action='store_true', help='confirm destructive reset')
    a = ap.parse_args()
    target = os.environ.get('TARGET', 'local').lower()
    ok = True
    with connect() as conn:
        if a.cmd == 'migrate': migrate(conn, target)
        elif a.cmd == 'seed': seed(conn)
        elif a.cmd == 'storage-sync': ok = storage_sync(conn)
        elif a.cmd == 'verify': ok = verify(conn)
        elif a.cmd == 'status': status(conn)
        elif a.cmd == 'setup':                          # migrate + seed + storage sync + verify
            migrate(conn, target); seed(conn); storage_sync(conn); ok = verify(conn)
        elif a.cmd == 'reset':
            if target == 'supabase' or not a.yes: sys.exit('reset only runs on a local target and needs --yes')
            reset(conn)
        conn.commit()                                    # sys.exit inside with would roll back, so exit only after committing
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()


