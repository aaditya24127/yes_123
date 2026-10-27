"""Checks the free file sorter against the demo dataset, where the right school and section are known from the folder.

Run from the project folder:  backend\\.venv\\Scripts\\python evaluation\\ingest_tests\\sort_demo_files.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')
from app.services.prioritization.data import get_conn
from app.services.ingest import readers, sorter

with get_conn() as c:
    schools = c.execute('select * from schools').fetchall()
    teachers = c.execute('select * from teachers').fetchall()

ok_s = ok_sec = n = 0
for f in sorted((ROOT / 'data' / 'schools').glob('*/*/*')):
    code, sec = f.parent.parent.name[:3], f.parent.name
    rr = readers.read(f.read_bytes(), f.name)
    g = sorter.sort_file(f.name, rr, schools, teachers, data=f.read_bytes())
    s = next((x['code'] for x in schools if x['id'] == g['school_id']), None)
    n += 1; ok_s += s == code; ok_sec += g['section'] == sec
    if s != code or g['section'] != sec:
        print(f"MISS {f.name[:55]:55s} truth={code}/{sec:12s} got={s}/{g['section']:12s} conf={g['confidence']} kind={rr.kind} {g['reasons'][:2]}")
print(f'school right {ok_s}/{n}   section right {ok_sec}/{n}')
