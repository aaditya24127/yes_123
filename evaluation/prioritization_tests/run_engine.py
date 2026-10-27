import sys, datetime as dt
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')
from app.services.prioritization.data import Data, get_conn
from app.services.prioritization import engine

AS_OF = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today()
with get_conn() as conn:
    data = Data(conn)
    for ent in ('school', 'teacher'):
        res = engine.run(data, AS_OF, ent)
        print(f"\n== {ent} ranking as of {AS_OF}  weights={res['normalized_weights']}  summary={res['summary']}")
        for i in res['items'][: (12 if ent == 'school' else 60)]:
            cs = ' '.join(f"{c['code'][:4]}={'-' if c['score'] is None else int(c['score'])}{'' if c['status'] == 'verified' else '*' if c['status']=='provisional' else '?'}" for c in i['categories'])
            print(f"{str(i['rank'] or '-'):>3} {i['school_code'] if ent=='school' else i['name'][:26]:<27} {str(i['score']):>5} {str(i['band']):<8} cov={i['coverage']:>5} {cs} | {[f['code'] for f in i['flags']]}")
