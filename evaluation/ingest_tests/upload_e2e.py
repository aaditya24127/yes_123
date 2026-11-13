"""End-to-end test against the running API (http://127.0.0.1:8000): upload the sample files, check sorting, import via the
job queue, and check that the new records reach the ranking. Run make_samples.py first."""
import json, sys, time
from pathlib import Path
import httpx

API = 'http://127.0.0.1:8000/api'
# The API needs a signed-in CRP: use the demo account (DEMO_CRP_EMAIL / DEMO_CRP_PASSWORD).
_demo = httpx.get(f'{API}/auth/demo').json()
_token = httpx.post(f'{API}/auth/login', json={'email': _demo['email'], 'password': _demo['password']}).json()['token']
httpx = httpx.Client(headers={'Authorization': f'Bearer {_token}'}, timeout=120)
S = Path(__file__).resolve().parent / 'samples'
files = [('files', (p.name, p.read_bytes())) for p in sorted(S.iterdir())]
before = {i['school_code']: i for i in httpx.post(f'{API}/ranking', json={'entity': 'school'}).json()['items']}

b = httpx.post(f'{API}/uploads', files=files, timeout=120).json()
print('batch', b['id'], b['counts'])
for it in b['items']:
    print(f"  {it['name']:45s} -> {it['school_code']}/{it['section']:12s} {it['status']:16s} conf={it['confidence']} {it['reasons'][:2]}")
q = httpx.post(f"{API}/uploads/{b['id']}/import").json(); print('queued', q)
for _ in range(60):
    b = httpx.get(f"{API}/uploads/{b['id']}").json()
    if b['status'] == 'done': break
    time.sleep(1)
print('import status', b['status'], b['counts'])
for it in b['items']:
    if it['status'] in ('imported', 'failed'):
        print(f"  {it['name']:45s} {it['status']:9s} {json.dumps(it['result'].get('counts'))} warnings={it['result'].get('warnings')} err={it['error']}")
after = {i['school_code']: i for i in httpx.post(f'{API}/ranking', json={'entity': 'school'}).json()['items']}
for code in ('S03', 'S01'):
    lg = lambda r: next(c for c in r[code]['categories'] if c['code'] == 'learning_gap')['explanation']
    print(code, 'score', before[code]['score'], '->', after[code]['score'], '|', lg(after))
w = {c['code']: c['weight'] for c in httpx.get(f'{API}/factors').json()['factors']}
w.update(girls_enrolled=10, attendance_gap=10)
r = httpx.post(f'{API}/ranking', json={'entity': 'school', 'weights': w}).json()
print('with girls + attendance factors:', [(i['school_code'], i['score']) for i in r['items']])
g = httpx.get(f'{API}/factors/girls_enrolled/preview').json()['rows'][:4]
print('girls factor preview:', [(x['school_code'], x['score'], x['explanation']) for x in g])
