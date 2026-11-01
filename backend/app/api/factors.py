"""Factors (the priority list's ingredients), the optional data behind them (facts), and CRP's manual changes to the list."""
import datetime as dt, io, json, re

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from .. import ai
from ..services.prioritization import engine
from ..services.prioritization.data import Data, get_conn
from ..services.ingest import readers
from ..services.ingest.sorter import match_school

router = APIRouter(prefix='/api', tags=['factors'])
GROUPS = ['Learning', 'Issues and follow-up', 'Visits and contact', 'Students and school', 'Your factors']


def _factor_rows(conn, d=None):
    d = d or Data(conn)
    counts = {r['fact_key']: r['n'] for r in conn.execute('select fact_key, count(distinct school_id) as n from facts group by fact_key').fetchall()}
    out = []
    for c in sorted(d.categories.values(), key=lambda c: (c.get('sort_order') or 100, c['code'])):
        if c['status'] == 'disabled': continue
        rp = c['rule_params'] or {}
        out.append(dict(code=c['code'], label=engine.label(d, c['code']), name=c['name'], description=c['description'], group=c.get('group_name') or 'Your factors',
                        scope=c.get('entity_scope') or 'both', status=c['status'], builtin=c['is_builtin'], proposed_by=c['proposed_by'], data_hint=c.get('data_hint'),
                        weight=round(d.weights.get(c['code'], 0), 2), uses_fact=rp.get('fact_key') if c['scorer'] == 'fact_rule' else None,
                        rule=rp if c['scorer'] == 'fact_rule' else None, schools_with_data=counts.get(rp.get('fact_key'), 0) if c['scorer'] == 'fact_rule' else None))
    return out


@router.get('/factors')
def factors():
    with get_conn() as conn:
        rows = _factor_rows(conn)
    return dict(factors=rows, groups=GROUPS)


@router.get('/factors/{code}/preview')
def preview(code: str, entity: str = 'school'):
    with get_conn() as conn:
        d = Data(conn)
        if code not in d.categories: raise HTTPException(404, 'unknown factor')
        return dict(code=code, entity=entity, rows=engine.preview_factor(d, dt.date.today(), entity, code))


class SuggestReq(BaseModel):
    description: str


@router.post('/factors/suggest')
def suggest(req: SuggestReq):
    with get_conn() as conn:
        rows = _factor_rows(conn)
        facts = conn.execute('select key, label, unit from fact_definitions order by key').fetchall()
    inp = dict(description=req.description.strip(),
               existing=[dict(code=r['code'], name=r['name'], description=r['description'] or '') for r in rows],
               facts=[dict(key=f['key'], label=f['label'], unit=f['unit']) for f in facts])
    try:
        r = ai.run('suggest_factor', inp)
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    return dict(r.data, suggested_by=r.provider)


class FactorReq(BaseModel):
    name: str
    description: str = ''
    fact_key: str
    fact_label: str | None = None
    unit: str | None = None
    entity_scope: str = 'school'
    mode: str = 'higher'
    low: float | None = None
    high: float | None = None
    target: float | None = None
    full_gap: float | None = None
    values: list[dict] = []          # [{school_id or teacher_id, value}]
    proposed_by: str = 'crp'
    weight: float | None = None      # switch it on straight away with this weight


def _slug(s): return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')[:40] or 'custom'


@router.post('/factors')
def create_factor(req: FactorReq):
    if req.mode not in ('higher', 'lower', 'below_target', 'above_target', 'yes'): raise HTTPException(400, 'unknown mode')
    if req.entity_scope not in ('school', 'teacher', 'both'): raise HTTPException(400, 'unknown scope')
    key = _slug(req.fact_key)
    code = 'custom_' + _slug(req.name)
    params = dict(fact_key=key, label=req.fact_label or req.name, unit=req.unit, mode=req.mode)
    for k in ('low', 'high', 'target', 'full_gap'):
        v = getattr(req, k)
        if v is not None: params[k] = v
    if req.mode in ('higher', 'lower'): params.setdefault('low', 0); params.setdefault('high', 100)
    if req.mode in ('below_target', 'above_target') and 'target' not in params: raise HTTPException(400, 'this kind of factor needs a target value')
    with get_conn() as conn:
        n = 1
        while conn.execute('select 1 from priority_categories where code = %s', (code,)).fetchone():
            n += 1; code = f"custom_{_slug(req.name)}_{n}"
        conn.execute("""insert into fact_definitions (key, label, unit, entity_type, description) values (%s,%s,%s,%s,%s)
                        on conflict (key) do update set label = excluded.label, unit = coalesce(excluded.unit, fact_definitions.unit)""",
                     (key, req.fact_label or req.name, req.unit, 'teacher' if req.entity_scope == 'teacher' else 'school', req.description))
        hint = f"{req.fact_label or req.name} (type in or upload)"
        conn.execute("""insert into priority_categories (code, name, description, scorer, rule_params, is_builtin, status, proposed_by, entity_scope, group_name, sort_order, data_hint)
                        values (%s,%s,%s,'fact_rule',%s,false,'approved',%s,%s,'Your factors',90,%s)""",
                     (code, req.name, req.description, json.dumps(params), req.proposed_by if req.proposed_by in ('crp', 'llm', 'system') else 'crp', req.entity_scope, hint))
        saved = _save_values(conn, key, req.values)
        conn.execute("insert into audit_logs (action, entity_type, details) values ('factor_created', 'priority_category', %s)", (json.dumps(dict(code=code, params=params)),))
        conn.commit()
    if req.weight:
        with get_conn() as conn:
            d = Data(conn); w = dict(d.weights); w[code] = req.weight
            engine.save_configuration(conn, w, None); conn.commit()
    return dict(code=code, fact_key=key, values_saved=saved)


class FactorPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    rule_params: dict | None = None


@router.patch('/factors/{code}')
def edit_factor(code: str, req: FactorPatch):
    with get_conn() as conn:
        c = conn.execute('select * from priority_categories where code = %s', (code,)).fetchone()
        if not c: raise HTTPException(404, 'unknown factor')
        params = dict(c['rule_params'] or {}); params.update(req.rule_params or {})
        conn.execute('update priority_categories set name = coalesce(%s, name), description = coalesce(%s, description), rule_params = %s where code = %s',
                     (req.name, req.description, json.dumps(params), code))
        conn.execute("insert into audit_logs (action, entity_type, details) values ('factor_edited', 'priority_category', %s)", (json.dumps(dict(code=code, params=params)),))
        conn.commit()
    return dict(ok=True)


@router.delete('/factors/{code}')
def remove_factor(code: str):
    with get_conn() as conn:
        d = Data(conn)
        if code in engine.CORE: raise HTTPException(400, 'the five main priorities cannot be deleted (set one to 0% instead)')
        c = d.categories.get(code)
        if not c: raise HTTPException(404, 'unknown factor')
        if c['is_builtin']: raise HTTPException(400, 'ready-made priorities cannot be deleted (set one to 0% instead)')
        if d.weights.get(code, 0) > 0:
            # switched on: take it out of the saved priorities first (the others share its weight), then delete it
            rest = {k: v for k, v in d.weights.items() if k != code and v > 0}
            if not rest: raise HTTPException(400, 'keep at least one other priority switched on')
            _, cid, _ = engine.save_configuration(conn, rest)
            d = Data(conn)
            for ent in ('school', 'teacher'):
                engine.persist_run(conn, d, dt.date.today(), ent, engine.run(d, dt.date.today(), ent), cid)
        conn.execute("update priority_categories set status = 'disabled' where code = %s", (code,))
        conn.execute("insert into audit_logs (action, entity_type, details) values ('factor_deleted', 'priority_category', %s)", (json.dumps(dict(code=code)),))
        conn.commit()
    return dict(ok=True)


# ---------------------------------------------------------------- facts (the optional data)
def _save_values(conn, key, values, source='manual'):
    n = 0
    for v in values or []:
        val = v.get('value')
        if val in (None, ''): continue
        num = None
        try: num = float(str(val).replace(',', ''))
        except ValueError: pass
        sid = v.get('school_id'); tid = v.get('teacher_id')
        if tid and not sid:
            sid = conn.execute('select school_id from teachers where id = %s', (tid,)).fetchone()['school_id']
        conn.execute('insert into facts (fact_key, school_id, teacher_id, value_num, value_text, as_of_date, source) values (%s,%s,%s,%s,%s,%s,%s)',
                     (key, sid, tid, num, None if num is not None else str(val), v.get('as_of') or dt.date.today(), source))
        n += 1
    return n


@router.get('/facts')
def fact_keys():
    with get_conn() as conn:
        return conn.execute('select key, label, unit, entity_type, description from fact_definitions order by label').fetchall()


@router.get('/facts/{key}')
def fact_values(key: str):
    with get_conn() as conn:
        fd = conn.execute('select * from fact_definitions where key = %s', (key,)).fetchone()
        if not fd: raise HTTPException(404, 'unknown data field')
        d = Data(conn)
        rows = []
        for s in d.schools:
            f = d.school_facts.get(s['id'], {}).get(key)
            rows.append(dict(school_id=str(s['id']), school_code=s['code'], school_name=s['name'], value=None if not f else (float(f['value_num']) if f['value_num'] is not None else f['value_text']),
                             as_of=str(f['as_of_date']) if f else None, source=f['source'] if f else None))
    return dict(definition=fd, values=rows)


class FactValues(BaseModel):
    values: list[dict]


@router.post('/facts/{key}')
def set_fact_values(key: str, req: FactValues):
    with get_conn() as conn:
        if not conn.execute('select 1 from fact_definitions where key = %s', (key,)).fetchone(): raise HTTPException(404, 'unknown data field')
        n = _save_values(conn, key, req.values); conn.commit()
    return dict(saved=n)


@router.post('/facts/{key}/upload')
async def upload_fact_values(key: str, file: UploadFile = File(...)):
    """Spreadsheet or CSV with one row per school: a column naming the school (code, name or UDISE) and a column with the number."""
    data = await file.read()
    rr = readers.read(data, file.filename or 'values.csv')
    if not rr.tables: raise HTTPException(400, 'Please upload an Excel or CSV file')
    with get_conn() as conn:
        if not conn.execute('select 1 from fact_definitions where key = %s', (key,)).fetchone(): raise HTTPException(404, 'unknown data field')
        schools = conn.execute('select * from schools where is_active').fetchall()
        matched, unmatched, values = [], [], []
        for t in rr.tables:
            for i, row in enumerate(t['rows'], 1):
                cells = [c for c in row if c]
                if len(cells) < 2: continue
                nums = [c for c in cells if re.fullmatch(r'-?\d+(?:[.,]\d+)?', c.replace(',', ''))]
                names = [c for c in cells if c not in nums]
                if not nums or not names: continue
                s, score, _ = match_school(' '.join(names), schools)
                if s and score >= 0.6:
                    values.append(dict(school_id=s['id'], value=nums[-1])); matched.append(dict(row=i, school=s['name'], value=nums[-1]))
                else:
                    unmatched.append(dict(row=i, text=' | '.join(cells)[:120]))
        saved = _save_values(conn, key, values, 'upload'); conn.commit()
    return dict(saved=saved, matched=matched, unmatched=unmatched)


# ---------------------------------------------------------------- manual changes to the list
class OverrideReq(BaseModel):
    entity_type: str
    id: str
    action: str
    points: float = 0
    reason: str
    expires_on: dt.date | None = None


@router.get('/overrides')
def overrides():
    with get_conn() as conn:
        rows = conn.execute("""select o.*, s.name as school_name, t.full_name as teacher_name from priority_overrides o join schools s on s.id = o.school_id
                               left join teachers t on t.id = o.teacher_id where o.active order by o.created_at desc""").fetchall()
    return [dict(r, id=str(r['id']), school_id=str(r['school_id']), teacher_id=str(r['teacher_id']) if r['teacher_id'] else None, points=float(r['points'])) for r in rows]


@router.post('/overrides')
def add_override(req: OverrideReq):
    if req.action not in ('pin_top', 'adjust', 'hold'): raise HTTPException(400, 'action must be pin_top, adjust or hold')
    if not req.reason.strip(): raise HTTPException(400, 'please give a reason')
    with get_conn() as conn:
        if req.entity_type == 'teacher':
            t = conn.execute('select school_id from teachers where id = %s', (req.id,)).fetchone()
            if not t: raise HTTPException(404, 'teacher not found')
            sid, tid = t['school_id'], req.id
        else:
            sid, tid = req.id, None
        conn.execute("update priority_overrides set active = false where entity_type = %s and school_id = %s and teacher_id is not distinct from %s",
                     (req.entity_type, sid, tid))
        oid = conn.execute("""insert into priority_overrides (entity_type, school_id, teacher_id, action, points, reason, expires_on, created_by)
                              values (%s,%s,%s,%s,%s,%s,%s,'crp') returning id""", (req.entity_type, sid, tid, req.action, req.points, req.reason.strip(), req.expires_on)).fetchone()['id']
        conn.execute("insert into audit_logs (action, entity_type, entity_id, details) values ('override_added', %s, %s, %s)",
                     (req.entity_type, tid or sid, json.dumps(req.model_dump(mode='json'))))
        conn.commit()
    return dict(id=str(oid))


@router.delete('/overrides/{oid}')
def remove_override(oid: str):
    with get_conn() as conn:
        conn.execute('update priority_overrides set active = false where id = %s', (oid,))
        conn.execute("insert into audit_logs (action, entity_type, entity_id) values ('override_removed', 'priority_override', %s)", (oid,))
        conn.commit()
    return dict(ok=True)
