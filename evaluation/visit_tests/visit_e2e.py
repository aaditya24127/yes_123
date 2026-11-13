"""End-to-end test of the 4-step visit and the CRP <-> teacher link against the running API (no audio, so no speech model download)."""
import time
import httpx

API = 'http://127.0.0.1:8000/api'
# The API needs a signed-in CRP: use the demo account (DEMO_CRP_EMAIL / DEMO_CRP_PASSWORD).
_demo = httpx.get(f'{API}/auth/demo').json()
_token = httpx.post(f'{API}/auth/login', json={'email': _demo['email'], 'password': _demo['password']}).json()['token']
httpx = httpx.Client(headers={'Authorization': f'Bearer {_token}'}, timeout=120)
d = httpx.get(f'{API}/directory').json()
t = next(x for x in d['teachers'] if x['teacher_code'] == 'S01-T01')
b = httpx.get(f'{API}/brief', params={'teacher_id': t['id']}, timeout=60).json()
print('1 brief:', b['who'], '| open issues', len(b['open_issues']), '| brief by', b['brief_by'])
s = httpx.post(f'{API}/sessions', json={'teacher_id': t['id'], 'class_no': 2, 'subject': 'Marathi', 'topic': 'reading two-letter words'}, timeout=60).json()
print('2 session', s['id'], 'stage', s['stage'])
s = httpx.patch(f"{API}/sessions/{s['id']}", json={'crp_notes': 'Teacher modelled blending clearly. Only front-row children answered. Reading corner now used daily.',
                                                    'changes_since_last': 'Daily guided reading groups started.'}).json()
s = httpx.post(f"{API}/sessions/{s['id']}/questions", timeout=120).json()
print('3 questions by', s.get('questions_by'), '|', [q['level'] for q in s['questions']])
s = httpx.post(f"{API}/sessions/{s['id']}/evaluate").json()
for _ in range(60):
    s = httpx.get(f"{API}/sessions/{s['id']}").json()
    if s['job'] and s['job']['status'] in ('completed', 'failed'): break
    time.sleep(1)
r = s['result']
print('4 evaluation:', s['job'], '| by', r.get('evaluated_by'), '| confidence', r.get('confidence'), '| next steps', len(r.get('next_steps', [])))
before = next(i for i in httpx.post(f'{API}/ranking', json={'entity': 'teacher'}).json()['items'] if i['id'] == t['id'])
sv = httpx.post(f"{API}/sessions/{s['id']}/save", json={}).json()
after = next(i for i in httpx.post(f'{API}/ranking', json={'entity': 'teacher'}).json()['items'] if i['id'] == t['id'])
tsv = lambda i: next(c for c in i['categories'] if c['code'] == 'time_since_visit')['explanation']
print('5 saved:', sv, '| time since visit:', tsv(before), '->', tsv(after), '| score', before['score'], '->', after['score'])

# CRP <-> teacher
link = httpx.post(f"{API}/teachers/{t['id']}/link").json()
rq = httpx.post(f'{API}/requests', json={'teacher_ids': [t['id']], 'kind': 'marks', 'message': 'Please send Class 2 unit test marks', 'due_date': '2026-11-05'}).json()
home = httpx.get(f"{API}/t/{link['token']}").json()
print('6 teacher sees', len(home['requests']), 'request(s):', home['requests'][0]['title'], '| messages', len(home['messages']))
sub = httpx.post(f"{API}/t/{link['token']}/submit", data={'request_id': home['requests'][0]['id'], 'text': 'Attached the marks.'},
                 files=[('files', ('class2_unit_test_marks.csv', b'class,subject,students_on_roll,students_assessed,students_below_40pct,test_date\n2,Marathi,40,38,15,2026-10-25\n'))]).json()
print('7 after submit, request status:', sub['requests'][0]['status'])
n = httpx.get(f'{API}/notifications').json()
print('8 CRP notifications:', [x['title'] for x in n][:3])
up = httpx.get(f"{API}/uploads").json()[0]
print('9 teacher upload waiting for CRP check:', up['note'], up['files'], 'file(s)')
