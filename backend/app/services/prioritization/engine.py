"""Prioritization engine: category scores (independent of weights) -> weighted ranking with coverage, bands, flags and alerts.

Python does all numerics. Identical validated data + same configuration + same as_of date => identical output.
Factors come from the priority_categories table (25 ready-made ones plus any a CRP adds); only factors with weight > 0 count.
"""
import datetime as dt
import json
from .scorers import SCORERS, NEED_LABEL, Ctx, CatResult
from .factors import FACTOR_SCORERS, fact_rule

CORE = ['learning_gap', 'unresolved_issue', 'overdue_followup', 'time_since_visit', 'recurring_need']      # the original five, always computed
LABEL = {'learning_gap': 'Learning Gap', 'unresolved_issue': 'Unresolved Issue', 'overdue_followup': 'Overdue Follow-up',
         'time_since_visit': 'Time Since Last Visit', 'recurring_need': 'Recurring Need'}
FLAG_LABEL = {'never_observed': 'Never observed', 'conflicting_records': 'Conflicting records', 'invalid_rows': 'Invalid rows excluded',
              'duplicates_ignored': 'Duplicate uploads ignored', 'insufficient_evidence': 'Insufficient evidence', 'no_assessments': 'No assessment results',
              'needs_review': 'Needs review', 'pinned': 'Pinned by CRP', 'adjusted': 'Adjusted by CRP', 'held': 'Held back by CRP'}
BAND_ORDER = ['critical', 'high', 'medium', 'low']
ALL_SCORERS = {**SCORERS, **FACTOR_SCORERS}


def label(data, code):
    return LABEL.get(code) or data.categories[code]['name']


def factor_codes(data):
    """Approved factors in display order."""
    cats = [c for c in data.categories.values() if c['status'] == 'approved']
    return [c['code'] for c in sorted(cats, key=lambda c: (c.get('sort_order') or 100, c['code']))]


def applies(data, code, entity):
    scope = data.categories[code].get('entity_scope') or 'both'
    return scope == 'both' or scope == entity


def band_of(score, th):
    return 'critical' if score >= th['critical'] else 'high' if score >= th['high'] else 'medium' if score >= th['medium'] else 'low'


def params_for(data):
    cfg = data.config
    p = {code: dict(c['rule_params'] or {}) for code, c in data.categories.items()}
    p['time_since_visit']['expected_interval_days'] = cfg['expected_visit_interval_days']
    return p


def _facts_for(data, school_id, teacher_id=None):
    out = dict(data.school_facts.get(school_id, {}))
    if teacher_id: out.update(data.teacher_facts.get(teacher_id, {}))
    return out


def make_contexts(data, as_of, entity):
    params = params_for(data)
    ctxs = []
    if entity == 'school':
        for s in data.schools:
            sid = s['id']
            ctxs.append(Ctx('school', s, None, [a for a in data.assessments if a['school_id'] == sid], [o for o in data.observations if o['school_id'] == sid],
                            [f for f in data.follow_ups if f['school_id'] == sid], [v for v in data.visits if v['school_id'] == sid], as_of, params,
                            interventions=[i for i in data.interventions if i['school_id'] == sid], attendance=data.attendance_by_school.get(sid, []),
                            school_teachers=data.teachers_by_school.get(sid, []), facts=_facts_for(data, sid)))
    else:
        for t in data.teachers:
            tid, sid = t['id'], t['school_id']
            ctxs.append(Ctx('teacher', data.school_by_id[sid], t, [a for a in data.assessments if a['teacher_id'] == tid],
                            [o for o in data.observations if o['teacher_id'] == tid], [f for f in data.follow_ups if f['teacher_id'] == tid],
                            [v for v in data.visits if v['teacher_id'] == tid and v['visit_type'] == 'classroom_observation'], as_of, params,
                            interventions=[i for i in data.interventions if i['teacher_id'] == tid], attendance=data.attendance_by_school.get(sid, []),
                            school_teachers=data.teachers_by_school.get(sid, []), facts=_facts_for(data, sid, tid)))
    return ctxs


def score_one(data, c, code):
    if not applies(data, code, c.kind):
        return CatResult(code, None, 'na', f'Not used for {c.kind}s.')
    scorer = data.categories[code]['scorer']
    if scorer == 'fact_rule':
        return fact_rule(c, code)
    fn = ALL_SCORERS.get(scorer) or ALL_SCORERS.get(code)
    if not fn:
        return CatResult(code, None, 'unknown', 'This factor has no calculation yet.')
    return fn(c)


def score_entities(data, as_of, entity, codes=None):
    codes = list(dict.fromkeys(CORE + (codes if codes is not None else factor_codes(data))))
    out = []
    for c in make_contexts(data, as_of, entity):
        cats = {code: score_one(data, c, code) for code in codes if code in data.categories}
        flags, alerts = [], []
        if any(a['validation_status'] == 'conflict' for a in c.assessments): flags.append('conflicting_records')
        if any(a['validation_status'] in ('invalid', 'needs_review') for a in c.assessments): flags.append('invalid_rows')
        if any(o['validation_status'] == 'duplicate' for o in c.observations): flags.append('duplicates_ignored')
        if cats['learning_gap'].status == 'unknown' and entity == 'school': flags.append('no_assessments')
        if cats['time_since_visit'].detail.get('never_observed'): flags.append('never_observed')
        od = cats['overdue_followup'].detail
        for it in od.get('items', []):
            if it['days'] > 30:
                alerts.append(dict(type='deadline', days=it['days'], message=f"Follow-up overdue by {it['days']} days: {(it['action'] or 'agreed action')}"))
        alerts = alerts[:3]
        tv = cats['time_since_visit'].detail.get('days')
        if tv and tv > 90 and not cats['time_since_visit'].detail.get('never_observed'):
            alerts.append(dict(type='visit', days=tv, message=f'No visit for {tv} days'))
        if cats['time_since_visit'].detail.get('never_observed'):
            alerts.append(dict(type='visit', days=tv, message=f'Never observed ({tv} days since joining)'))
        out.append(dict(ctx=c, cats=cats, flags=flags, alerts=alerts))
    return out


def normalize(raw, codes):
    w = {c: max(0.0, float(raw.get(c, 0) or 0)) for c in codes}
    tot = sum(w.values())
    if tot <= 0: raise ValueError('at least one weight must be above zero')
    return {c: 100.0 * v / tot for c, v in w.items()}


def _override_for(data, entity, c):
    key = (entity, str((c.teacher or c.school)['id']))
    return data.overrides.get(key)


def rank(data, scored, raw_weights, entity):
    cfg = data.config
    th, min_cov = cfg['band_thresholds'], float(cfg['min_coverage_for_ranking'])
    codes = [c for c in factor_codes(data) if float(raw_weights.get(c, 0) or 0) > 0]
    w = normalize(raw_weights, codes)
    items = []
    for e in scored:
        c, cats = e['ctx'], e['cats']
        applicable = {k: w[k] for k in codes if cats[k].status != 'na'}
        known = {k: cats[k] for k in applicable if cats[k].status in ('verified', 'provisional')}
        aw, kw = sum(applicable.values()), sum(w[k] for k in known)
        coverage = 100.0 * kw / aw if aw > 0 else 0.0
        flags = list(e['flags']); score = None; band = None
        if kw > 0:
            score = sum(w[k] * r.score for k, r in known.items()) / kw
        insufficient = score is None or coverage < min_cov
        if insufficient: flags.append('insufficient_evidence')
        provisional = (not insufficient) and (coverage < 99.99 or any(r.status == 'provisional' for r in known.values()))
        needs_review = any(f in flags for f in ('conflicting_records', 'invalid_rows')) or any(cats[k].status == 'review' for k in codes)
        if needs_review and 'needs_review' not in flags: flags.append('needs_review')
        ov = _override_for(data, entity, c); pinned = held = False; adjusted_from = None
        if ov and not insufficient:
            if ov['action'] == 'adjust' and float(ov['points']):
                adjusted_from = score; score = max(0.0, min(100.0, score + float(ov['points']))); flags.append('adjusted')
            elif ov['action'] == 'pin_top': pinned = True; flags.append('pinned')
            elif ov['action'] == 'hold': held = True; flags.append('held')
        if not insufficient: band = band_of(score, th)
        catlist = []
        for k in codes:
            r = cats[k]
            contrib = (w[k] * r.score / kw) if (k in known and kw > 0) else None
            catlist.append(dict(code=k, label=label(data, k), name=data.categories[k]['name'], score=None if r.score is None else round(r.score, 1), status=r.status,
                                weight=round(w[k], 1), contribution=None if contrib is None else round(contrib, 1), explanation=r.explanation))
        reasons = [x['explanation'] for x in sorted([x for x in catlist if x['contribution']], key=lambda x: -x['contribution'])[:3]]
        if insufficient:
            reasons = [x['explanation'] for x in catlist if x['status'] == 'unknown'][:2] or ['Not enough validated evidence to rank.']
        if ov and not insufficient:
            reasons.insert(0, f"CRP note: {ov['reason']}")
        s, t = c.school, c.teacher
        base = dict(entity=entity, id=str(t['id'] if t else s['id']), school_id=str(s['id']), school_name=s['name'], school_code=s['code'],
                    name=(f"{t['title']} {t['full_name']}" if t else s['name']),
                    subtitle=(f"{t['designation']} · {s['name']}" if t else f"{s['school_type']} · {s['board']} · {s['medium']} medium"),
                    location=(s['village'] + ', ' + (s['taluka'] or '') if not t else ', '.join(map(str, t['subjects_taught'][:3]))),
                    grades=(f"Classes {s['grade_from']}–{s['grade_to']}" if not t else 'Classes ' + ', '.join(map(str, t['classes_taught'])) if t['classes_taught'] else ''))
        items.append(dict(base, score=None if (score is None or insufficient) else round(score, 1), band=band, coverage=round(coverage, 1), provisional=provisional,
                          insufficient=insufficient, needs_review=needs_review, flags=[dict(code=f, label=FLAG_LABEL.get(f, f)) for f in dict.fromkeys(flags)],
                          alerts=e['alerts'], categories=catlist, reasons=reasons, headline=reasons[0] if reasons else '', rank=None,
                          override=None if not ov else dict(id=str(ov['id']), action=ov['action'], points=float(ov['points']), reason=ov['reason'],
                                                            score_before=None if adjusted_from is None else round(adjusted_from, 1)),
                          _raw=score, _pin=pinned, _held=held))
    ranked = sorted([i for i in items if not i['insufficient']], key=lambda i: (not i['_pin'], i['_held'], -i['_raw'], -i['coverage'], i['name']))
    for n, i in enumerate(ranked, 1): i['rank'] = n
    rest = sorted([i for i in items if i['insufficient']], key=lambda i: (-(i['_raw'] or 0), i['name']))
    for i in items:
        for k in ('_raw', '_pin', '_held'): i.pop(k)
    final = ranked + rest
    summary = {b: sum(1 for i in ranked if i['band'] == b) for b in BAND_ORDER}
    summary.update(insufficient=len(rest), needs_review=sum(1 for i in items if i['needs_review']), total=len(items))
    return dict(entity=entity, normalized_weights={k: round(v, 2) for k, v in w.items()}, items=final, summary=summary)


def run(data, as_of, entity, raw_weights=None):
    raw = raw_weights or data.weights
    active = [c for c in factor_codes(data) if float(raw.get(c, 0) or 0) > 0]
    return rank(data, score_entities(data, as_of, entity, active), raw, entity)


def preview_factor(data, as_of, entity, code):
    """Score every school/teacher on one factor (used before a CRP switches a factor on)."""
    rows = []
    for e in score_entities(data, as_of, entity, [code]):
        c, r = e['ctx'], e['cats'][code]
        rows.append(dict(id=str((c.teacher or c.school)['id']), name=(f"{c.teacher['title']} {c.teacher['full_name']}" if c.teacher else c.school['name']),
                         school_code=c.school['code'], score=None if r.score is None else round(r.score, 1), status=r.status, explanation=r.explanation))
    return sorted(rows, key=lambda x: (x['score'] is None, -(x['score'] or 0), x['name']))


# ---- evidence behind a score (for the detail view)
def evidence(data, as_of, entity, entity_id):
    active = [c for c in factor_codes(data) if float(data.weights.get(c, 0) or 0) > 0]
    for e in score_entities(data, as_of, entity, active):
        c = e['ctx']
        if str((c.teacher or c.school)['id']) != entity_id: continue
        out = []
        for code in dict.fromkeys(active):
            r = e['cats'][code]; rows = []
            if r.status == 'na': continue
            for rtype, rid, fid in r.inputs:
                rec = _record(data, rtype, rid)
                f = data.files.get(fid) if fid else None
                rows.append(dict(record_type=rtype, record_id=str(rid), summary=rec['summary'], date=rec['date'], locator=rec.get('locator'),
                                 file=None if not f else dict(id=str(f['id']), name=f['original_filename'], format=f['file_format'], section=f['section'], kind=f['doc_kind'])))
            out.append(dict(code=code, label=label(data, code), status=r.status, explanation=r.explanation, detail=r.detail, records=rows))
        return out
    return []


def _record(data, rtype, rid):
    if rtype == 'assessment':
        a = next(x for x in data.assessments if x['id'] == rid)
        return dict(summary=f"Class {a['class_no']} {a['subject']}: {a['students_below']} of {a['students_assessed']} below benchmark", date=str(a['assessment_date']), locator=a['locator'])
    if rtype == 'observation':
        o = next(x for x in data.observations if x['id'] == rid)
        return dict(summary=o['issue_text'], date=str(o['observation_date']), locator=o['locator'])
    if rtype == 'follow_up':
        f = next(x for x in data.follow_ups if x['id'] == rid)
        return dict(summary=f"{f['action'] or 'Follow-up'} (due {f['due_date']}, {f['status']})", date=str(f['due_date']), locator=f['plan_locator'])
    if rtype == 'intervention':
        i = next(x for x in data.interventions if x['id'] == rid)
        return dict(summary=f"{i['approved_action'] or i['recommended_action']} ({i['status']}, planned {i['planned_completion']})", date=str(i['created_on']), locator=i['locator'])
    if rtype == 'attendance':
        a = next(x for s in data.attendance_by_school.values() for x in s if x['id'] == rid)
        return dict(summary=f"Attendance {a['month']}: {a['avg_attendance_pct']}% (target {a['target_pct']}%)", date=a['month'], locator=a['locator'])
    if rtype == 'fact':
        f = data.fact_by_id[rid]
        return dict(summary=f"{f['fact_key']}: {f['value_num'] if f['value_num'] is not None else f['value_text']}", date=str(f['as_of_date']), locator=f['locator'])
    if rtype == 'teacher':
        t = data.teacher_by_id[rid]
        return dict(summary=f"{t['title']} {t['full_name']} ({t['designation']}, joined {t['joined_date']})", date=str(t['joined_date']), locator=None)
    v = next(x for x in data.visits if x['id'] == rid)
    return dict(summary=f"{v['visit_type'].replace('_', ' ').capitalize()}", date=str(v['visit_date']), locator=None)


# ---- persistence: configuration versions and stored runs
def save_configuration(conn, raw_weights, name=None):
    approved = {r['code'] for r in conn.execute("select code from priority_categories where status = 'approved'").fetchall()}
    unknown = [c for c, v in raw_weights.items() if float(v or 0) > 0 and c not in approved]
    if unknown: raise ValueError(f"these factors are not approved yet: {', '.join(unknown)}")
    codes = [c for c in raw_weights if c in approved and float(raw_weights[c] or 0) > 0]
    w = normalize(raw_weights, codes)
    r = {c: round(v, 2) for c, v in w.items()}
    r[max(r, key=r.get)] = round(r[max(r, key=r.get)] + (100 - sum(r.values())), 2)
    prev = conn.execute("select * from priority_configurations where status = 'active'").fetchone()
    ver = conn.execute('select coalesce(max(version), 0) + 1 as v from priority_configurations').fetchone()['v']
    cid = conn.execute('insert into priority_configurations (version, name, band_thresholds, missing_data_policy, min_coverage_for_ranking, expected_visit_interval_days, notes) '
                       'values (%s, %s, %s, %s, %s, %s, %s) returning id',
                       (ver, name or f'CRP priorities v{ver}', json.dumps(prev['band_thresholds']), prev['missing_data_policy'], prev['min_coverage_for_ranking'],
                        prev['expected_visit_interval_days'], 'Saved from the priority settings panel')).fetchone()['id']
    for c, wt in r.items():
        conn.execute('insert into priority_config_weights (config_id, category_id, weight) select %s, id, %s from priority_categories where code = %s', (cid, wt, c))
    conn.execute('select activate_priority_configuration(%s)', (cid,))
    return ver, cid, r


def persist_run(conn, data, as_of, entity, result, config_id):
    run_id = conn.execute('insert into priority_runs (config_id, as_of_date, entity_type) values (%s, %s, %s) returning id', (config_id, as_of, entity)).fetchone()['id']
    cat_id = {c['code']: c['id'] for c in conn.execute('select id, code from priority_categories').fetchall()}
    active = list(result['normalized_weights'])
    scored = {str((e['ctx'].teacher or e['ctx'].school)['id']): e for e in score_entities(data, as_of, entity, active)}
    for it in result['items']:
        rid = conn.execute('insert into priority_results (run_id, entity_type, school_id, teacher_id, overall_score, band, rank, data_coverage, is_provisional, needs_review, flags, alerts) '
                           'values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id',
                           (run_id, entity, it['school_id'], it['id'] if entity == 'teacher' else None, it['score'], it['band'], it['rank'], it['coverage'], it['provisional'],
                            it['needs_review'], json.dumps([f['code'] for f in it['flags']]), json.dumps(it['alerts']))).fetchone()['id']
        for cs in it['categories']:
            sid = conn.execute('insert into priority_category_scores (result_id, category_id, score, status, weight, weighted_contribution, explanation) '
                               'values (%s,%s,%s,%s,%s,%s,%s) returning id', (rid, cat_id[cs['code']], cs['score'], cs['status'], cs['weight'], cs['contribution'], cs['explanation'])).fetchone()['id']
            for rtype, rec_id, fid in scored[it['id']]['cats'][cs['code']].inputs:
                conn.execute('insert into priority_result_inputs (category_score_id, record_type, record_id, source_file_id) values (%s,%s,%s,%s)', (sid, rtype, rec_id, fid))
    return run_id
