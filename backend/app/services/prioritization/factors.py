"""The factor library beyond the original five, plus the generic 'fact_rule' scorer used by factors a CRP creates.

Every scorer takes a Ctx and returns a CatResult with a 0-100 score (higher = needs a visit sooner).
Status 'na' means the factor does not apply to this school/teacher; it is then left out of the weighting entirely.
"""
from .scorers import CatResult, Ctx, NEED_LABEL, _d, _real, _threads

LANGUAGE_SUBJECTS = {'english', 'marathi', 'hindi', 'urdu', 'gujarati', 'kannada', 'telugu', 'tamil', 'bengali', 'odia', 'malayalam', 'sanskrit'}
MATHS_SUBJECTS = {'mathematics', 'maths', 'math', 'ganit'}
SEV = {'minor': 1, 'significant': 2, 'critical': 3}


def _f(x): return None if x is None else float(x)


def _scale(v, low, high):
    """0 at `low`, 100 at `high`, straight line in between (works for high < low too)."""
    if high == low: return 100.0 if v >= high else 0.0
    return round(max(0.0, min(100.0, 100.0 * (v - low) / (high - low))), 2)


def _p(c: Ctx, code): return c.params.get(code, {})


def _latest_valid(c: Ctx, keep=lambda a: True):
    ok = [a for a in c.assessments if a['validation_status'] == 'valid' and a['students_assessed'] and keep(a)]
    latest = {}
    for a in sorted(ok, key=lambda a: (a['assessment_date'], str(a['id']))):
        latest[(a['class_no'], a['subject'], a['skill'])] = a
    return list(latest.values())


def _gap_subset(c: Ctx, code, keep, what, na_reason=None):
    rows = _latest_valid(c, keep)
    if not rows:
        if na_reason and na_reason(c):
            return CatResult(code, None, 'na', f'Not applicable: {na_reason(c)}.')
        return CatResult(code, None, 'unknown', f'No usable {what} results.')
    assessed = sum(a['students_assessed'] for a in rows); below = sum(a['students_below'] for a in rows)
    gap = 100.0 * below / assessed
    full = _p(c, code).get('full_score_at_gap_pct', 60)
    worst = max(rows, key=lambda a: a['students_below'] / a['students_assessed'])
    return CatResult(code, _scale(gap, 0, full), 'verified',
                     f"{gap:.0f}% of {assessed} students are below the benchmark in {what}; highest in Class {worst['class_no']} {worst['subject']}.",
                     dict(gap_pct=round(gap, 1), assessed=assessed, below=below), [('assessment', a['id'], a['source_file_id']) for a in rows])


# ------------------------------------------------------------------ learning
def learning_trend(c: Ctx) -> CatResult:
    ok = [a for a in c.assessments if a['validation_status'] == 'valid' and a['students_assessed']]
    series = {}
    for a in sorted(ok, key=lambda a: a['assessment_date']):
        series.setdefault((a['class_no'], a['subject'], a['skill']), {})[a['assessment_date']] = a
    pairs = []
    for key, by_date in series.items():
        if len(by_date) < 2: continue
        d = sorted(by_date); prev, last = by_date[d[-2]], by_date[d[-1]]
        g0 = 100.0 * prev['students_below'] / prev['students_assessed']; g1 = 100.0 * last['students_below'] / last['students_assessed']
        pairs.append((key, g0, g1, prev, last))
    if not pairs:
        return CatResult('learning_trend', None, 'unknown', 'Only one test on record, so no trend yet.')
    change = sum(p[2] - p[1] for p in pairs) / len(pairs)
    worst = max(pairs, key=lambda p: p[2] - p[1])
    full = _p(c, 'learning_trend').get('full_score_at_pts', 15)
    word = 'worse' if change > 0.5 else 'better' if change < -0.5 else 'about the same'
    txt = (f"Learning gap is {word} between the last two tests ({change:+.0f} points on average); "
           f"biggest change: Class {worst[0][0]} {worst[0][1]} {worst[1]:.0f}% to {worst[2]:.0f}%.")
    return CatResult('learning_trend', _scale(change, 0, full), 'verified', txt, dict(change_pts=round(change, 1), compared=len(pairs)),
                     [('assessment', p[4]['id'], p[4]['source_file_id']) for p in pairs] + [('assessment', p[3]['id'], p[3]['source_file_id']) for p in pairs])


def foundational_gap(c: Ctx) -> CatResult:
    top = _p(c, 'foundational_gap').get('max_class', 3)
    def na(c):
        lo = (c.teacher['classes_taught'] and min(c.teacher['classes_taught'])) if c.teacher else c.school['grade_from']
        return f'no Class 1-{top} here' if lo and lo > top else None
    return _gap_subset(c, 'foundational_gap', lambda a: a['class_no'] <= top, f'Classes 1-{top} (foundational)', na)


def language_gap(c: Ctx) -> CatResult:
    return _gap_subset(c, 'language_gap', lambda a: a['subject'].strip().lower() in LANGUAGE_SUBJECTS or 'read' in (a['skill'] or '').lower(),
                       'languages and reading',
                       lambda c: 'does not teach a language' if c.teacher and not any(s.lower() in LANGUAGE_SUBJECTS for s in c.teacher['subjects_taught']) else None)


def maths_gap(c: Ctx) -> CatResult:
    return _gap_subset(c, 'maths_gap', lambda a: a['subject'].strip().lower() in MATHS_SUBJECTS, 'Mathematics',
                       lambda c: 'does not teach Mathematics' if c.teacher and not any(s.lower() in MATHS_SUBJECTS for s in c.teacher['subjects_taught']) else None)


def low_class_average(c: Ctx) -> CatResult:
    rows = [a for a in _latest_valid(c) if a['class_avg_pct'] is not None]
    if not rows:
        return CatResult('low_class_average', None, 'unknown', 'No class averages in the results.')
    avg = sum(_f(a['class_avg_pct']) * a['students_assessed'] for a in rows) / sum(a['students_assessed'] for a in rows)
    p = _p(c, 'low_class_average'); good, poor = p.get('good_avg_pct', 65), p.get('poor_avg_pct', 35)
    low = min(rows, key=lambda a: _f(a['class_avg_pct']))
    return CatResult('low_class_average', _scale(avg, good, poor), 'verified',
                     f"Average score is {avg:.0f}%; lowest is Class {low['class_no']} {low['subject']} at {_f(low['class_avg_pct']):.0f}%.",
                     dict(avg_pct=round(avg, 1)), [('assessment', a['id'], a['source_file_id']) for a in rows])


def test_participation(c: Ctx) -> CatResult:
    rows = [a for a in _latest_valid(c) if a['students_on_roll']]
    if not rows:
        return CatResult('test_participation', None, 'unknown', 'Results do not say how many students are on the roll.')
    roll = sum(a['students_on_roll'] for a in rows); took = sum(a['students_assessed'] for a in rows)
    missed = max(0.0, 100.0 * (roll - took) / roll)
    full = _p(c, 'test_participation').get('full_score_at_missed_pct', 25)
    return CatResult('test_participation', _scale(missed, 0, full), 'verified',
                     f"{missed:.0f}% of students on the roll did not take the latest tests ({took} of {roll} took them).",
                     dict(missed_pct=round(missed, 1)), [('assessment', a['id'], a['source_file_id']) for a in rows])


def hotspot_class(c: Ctx) -> CatResult:
    rows = _latest_valid(c)
    if not rows:
        return CatResult('hotspot_class', None, 'unknown', 'No usable assessment results.')
    w = max(rows, key=lambda a: a['students_below'] / a['students_assessed'])
    g = 100.0 * w['students_below'] / w['students_assessed']
    p = _p(c, 'hotspot_class')
    return CatResult('hotspot_class', _scale(g, p.get('ok_gap_pct', 25), p.get('full_score_at_gap_pct', 70)), 'verified',
                     f"Weakest class: Class {w['class_no']} {w['subject']}{' (' + w['skill'] + ')' if w['skill'] else ''}, {g:.0f}% below the benchmark.",
                     dict(gap_pct=round(g, 1), class_no=w['class_no'], subject=w['subject']), [('assessment', w['id'], w['source_file_id'])])


# ------------------------------------------------------------------ issues and follow-through
def _open_threads(c: Ctx):
    issues = [o for o in _real(c) if o['severity'] != 'none' and o['need_code'] != 'GOOD_PRACTICE']
    out = []
    for key, lst in _threads(issues).items():
        if lst[-1]['status'] in ('open', 'in_progress'):
            out.append((lst[0], lst[-1]))
    return out


def critical_open_issues(c: Ctx) -> CatResult:
    if not _real(c):
        return CatResult('critical_open_issues', None, 'unknown', 'No classroom observations recorded yet.')
    serious = [(f, l) for f, l in _open_threads(c) if l['severity'] in ('significant', 'critical')]
    pts = sum(2 if l['severity'] == 'critical' else 1 for f, l in serious)
    score = {0: 0, 1: 40, 2: 70}.get(pts, 100)
    if not serious:
        return CatResult('critical_open_issues', 0.0, 'verified', 'No serious issues are open.')
    n_crit = sum(1 for f, l in serious if l['severity'] == 'critical')
    return CatResult('critical_open_issues', float(score), 'verified',
                     f"{len(serious)} serious issue{'s' if len(serious) != 1 else ''} open ({n_crit} critical).",
                     dict(open_serious=len(serious), critical=n_crit), [('observation', l['id'], l['source_file_id']) for f, l in serious])


def issue_age(c: Ctx) -> CatResult:
    if not _real(c):
        return CatResult('issue_age', None, 'unknown', 'No classroom observations recorded yet.')
    th = _open_threads(c)
    if not th:
        return CatResult('issue_age', 0.0, 'verified', 'No issues are waiting to be solved.')
    first, last = max(th, key=lambda t: (c.as_of - t[0]['observation_date']).days)
    days = (c.as_of - first['observation_date']).days
    p = _p(c, 'issue_age')
    return CatResult('issue_age', _scale(days, p.get('ok_days', 30), p.get('full_score_days', 180)), 'verified',
                     f"Oldest open issue ({NEED_LABEL.get(first['need_code'], first['need_code'])}) was first noted {days} days ago ({_d(first['observation_date'])}).",
                     dict(days=days), [('observation', first['id'], first['source_file_id'])])


def actions_not_completed(c: Ctx) -> CatResult:
    iv = c.interventions
    if not iv:
        return CatResult('actions_not_completed', None, 'unknown', 'No agreed actions on record.')
    late = [i for i in iv if i['status'] in ('not_completed', 'rejected')
            or (i['status'] in ('proposed', 'approved', 'in_progress') and i['planned_completion'] and i['planned_completion'] < c.as_of)]
    share = 100.0 * len(late) / len(iv)
    if not late:
        return CatResult('actions_not_completed', 0.0, 'verified', f'All {len(iv)} agreed actions are done or still on time.')
    return CatResult('actions_not_completed', round(share, 2), 'verified',
                     f"{len(late)} of {len(iv)} agreed actions are past their planned date or were not done.",
                     dict(late=len(late), total=len(iv)), [('intervention', i['id'], i['source_file_id']) for i in late])


# ------------------------------------------------------------------ contact and coverage
def visit_frequency(c: Ctx) -> CatResult:
    p = _p(c, 'visit_frequency'); window = p.get('window_days', 90); interval = c.params['time_since_visit']['expected_interval_days']
    vs = c.visits if c.kind == 'school' else c.classroom_visits
    recent = [v for v in vs if 0 <= (c.as_of - v['visit_date']).days <= window]
    expected = max(1, round(window / interval))
    score = _scale(expected - len(recent), 0, expected)
    return CatResult('visit_frequency', score, 'verified',
                     f"{len(recent)} visit{'s' if len(recent) != 1 else ''} in the last {window} days; about {expected} expected.",
                     dict(recent=len(recent), expected=expected), [('visit', v['id'], v['source_file_id']) for v in recent])


def teachers_unobserved(c: Ctx) -> CatResult:
    if c.kind == 'teacher':
        return CatResult('teachers_unobserved', None, 'na', 'Not applicable to a single teacher (see Time Since Last Visit).')
    ts = c.school_teachers
    if not ts:
        return CatResult('teachers_unobserved', None, 'unknown', 'No teachers listed for this school.')
    seen = {v['teacher_id'] for v in c.visits if v['visit_type'] == 'classroom_observation' and v['teacher_id']}
    never = [t for t in ts if t['id'] not in seen]
    share = 100.0 * len(never) / len(ts)
    return CatResult('teachers_unobserved', round(share, 2), 'verified',
                     f"{len(never)} of {len(ts)} teachers have never had a classroom observation.",
                     dict(never=len(never), teachers=len(ts)), [('teacher', t['id'], None) for t in never])


def new_teacher_support(c: Ctx) -> CatResult:
    months = _p(c, 'new_teacher_support').get('new_for_days', 365)
    if c.kind == 'teacher':
        j = c.teacher['joined_date']
        if not j: return CatResult('new_teacher_support', None, 'unknown', 'Joining date not known.')
        days = (c.as_of - j).days
        if days >= months: return CatResult('new_teacher_support', 0.0, 'verified', f'Experienced in this school (joined {_d(j)}).')
        return CatResult('new_teacher_support', _scale(days, months, 0), 'verified', f'New teacher: joined {days} days ago ({_d(j)}).', dict(days=days),
                         [('teacher', c.teacher['id'], None)])
    ts = [t for t in c.school_teachers if t['joined_date']]
    if not ts: return CatResult('new_teacher_support', None, 'unknown', 'Teacher joining dates not known.')
    new = [t for t in ts if (c.as_of - t['joined_date']).days < months]
    return CatResult('new_teacher_support', round(100.0 * len(new) / len(ts), 2), 'verified',
                     f"{len(new)} of {len(ts)} teachers joined in the last year." if new else 'No teachers joined in the last year.',
                     dict(new=len(new)), [('teacher', t['id'], None) for t in new])


def data_freshness(c: Ctx) -> CatResult:
    dates = [a['assessment_date'] for a in c.assessments if a['assessment_date']] + [o['observation_date'] for o in c.observations] + \
            [v['visit_date'] for v in c.visits]
    if c.kind == 'school':
        dates += [a['month_date'] for a in c.attendance if a.get('month_date')]
    if not dates:
        return CatResult('data_freshness', None, 'unknown', 'No dated records at all.')
    last = max(dates); days = (c.as_of - last).days
    p = _p(c, 'data_freshness')
    return CatResult('data_freshness', _scale(days, p.get('ok_days', 45), p.get('full_score_days', 180)), 'verified',
                     f"Newest information is {days} days old ({_d(last)}).", dict(days=days))


# ------------------------------------------------------------------ students and school context
def _att(c: Ctx):
    return sorted(c.attendance, key=lambda a: a['month'])


def attendance_gap(c: Ctx) -> CatResult:
    if c.kind == 'teacher':
        return CatResult('attendance_gap', None, 'na', 'Attendance is recorded for the whole school.')
    a = _att(c)
    if not a: return CatResult('attendance_gap', None, 'unknown', 'No attendance records.')
    last = a[-1]; act, tgt = _f(last['avg_attendance_pct']), _f(last['target_pct'])
    full = _p(c, 'attendance_gap').get('full_score_gap_pts', 20)
    return CatResult('attendance_gap', _scale(tgt - act, 0, full), 'verified',
                     f"Attendance in {last['month']} was {act:.0f}% against a {tgt:.0f}% target.",
                     dict(actual=act, target=tgt), [('attendance', last['id'], last['source_file_id'])])


def attendance_trend(c: Ctx) -> CatResult:
    if c.kind == 'teacher':
        return CatResult('attendance_trend', None, 'na', 'Attendance is recorded for the whole school.')
    a = _att(c)
    if len(a) < 2: return CatResult('attendance_trend', None, 'unknown', 'Need two months of attendance to see a trend.')
    drop = _f(a[-2]['avg_attendance_pct']) - _f(a[-1]['avg_attendance_pct'])
    full = _p(c, 'attendance_trend').get('full_score_drop_pts', 10)
    word = 'fell' if drop > 0 else 'rose' if drop < 0 else 'did not change'
    return CatResult('attendance_trend', _scale(drop, 0, full), 'verified',
                     f"Attendance {word} from {_f(a[-2]['avg_attendance_pct']):.0f}% ({a[-2]['month']}) to {_f(a[-1]['avg_attendance_pct']):.0f}% ({a[-1]['month']}).",
                     dict(drop_pts=round(drop, 1)), [('attendance', x['id'], x['source_file_id']) for x in a[-2:]])


def pupil_teacher_ratio(c: Ctx) -> CatResult:
    if c.kind == 'teacher':
        return CatResult('pupil_teacher_ratio', None, 'na', 'Calculated for the whole school.')
    ts = c.school_teachers
    if not ts: return CatResult('pupil_teacher_ratio', None, 'unknown', 'No teachers listed.')
    fact = c.facts.get('enrolment_total')
    if fact and fact['value_num'] is not None:
        students, src, ins = float(fact['value_num']), 'enrolment figure', [('fact', fact['id'], fact['source_file_id'])]
    else:
        per_class = {}
        for a in c.assessments:
            if a['validation_status'] == 'valid' and a['students_on_roll']:
                per_class[a['class_no']] = max(per_class.get(a['class_no'], 0), a['students_on_roll'])
        if not per_class: return CatResult('pupil_teacher_ratio', None, 'unknown', 'Number of students is not known (add enrolment or upload results).')
        students, src, ins = float(sum(per_class.values())), 'class rolls in test results', []
    ptr = students / len(ts)
    p = _p(c, 'pupil_teacher_ratio')
    return CatResult('pupil_teacher_ratio', _scale(ptr, p.get('norm', 30), p.get('full_score_at', 50)), 'verified',
                     f"About {ptr:.0f} students per teacher ({students:.0f} students from {src}, {len(ts)} teachers); the norm is {p.get('norm', 30)}.",
                     dict(ratio=round(ptr, 1)), ins)


def _multigrade(t):
    primary = [k for k in (t['classes_taught'] or []) if k <= 5]
    return len(primary) if len(primary) >= 2 else 0


def teaching_load(c: Ctx) -> CatResult:
    if c.kind == 'teacher':
        n = _multigrade(c.teacher)
        if not c.teacher['classes_taught']: return CatResult('teaching_load', None, 'unknown', 'Classes taught are not known.')
        if not n: return CatResult('teaching_load', 0.0, 'verified', 'Teaches one primary class at a time (no multi-grade load).')
        return CatResult('teaching_load', 60.0 if n == 2 else 100.0, 'verified',
                         f"Handles {n} primary classes together (multi-grade teaching).", dict(classes=n), [('teacher', c.teacher['id'], None)])
    ts = c.school_teachers
    if not ts: return CatResult('teaching_load', None, 'unknown', 'No teachers listed.')
    mg = [t for t in ts if _multigrade(t)]
    return CatResult('teaching_load', round(100.0 * len(mg) / len(ts), 2), 'verified',
                     f"{len(mg)} of {len(ts)} teachers handle more than one primary class together." if mg else 'No multi-grade teaching.',
                     dict(multigrade=len(mg)), [('teacher', t['id'], None) for t in mg])


# ------------------------------------------------------------------ generic rule on a stored fact (girls enrolled, CWSN, any CRP factor)
def fact_rule(c: Ctx, code: str) -> CatResult:
    p = _p(c, code); key = p.get('fact_key'); label = p.get('label') or key
    f = c.facts.get(key)
    if not f or (f['value_num'] is None and f['value_text'] is None):
        return CatResult(code, None, 'unknown', f"No '{label}' figure yet (add it in the factor settings or upload it).")
    mode = p.get('mode', 'higher')
    if mode == 'yes':
        yes = str(f['value_text'] if f['value_text'] is not None else f['value_num']).strip().lower() in ('yes', 'y', 'true', '1')
        score = 100.0 if yes else 0.0
        txt = f"{label}: {'yes' if yes else 'no'}."
    else:
        v = float(f['value_num'])
        if mode == 'higher': score = _scale(v, p.get('low', 0), p.get('high', 100))
        elif mode == 'lower': score = _scale(v, p.get('high', 100), p.get('low', 0))
        elif mode == 'below_target': score = _scale(p.get('target', 0) - v, 0, p.get('full_gap', max(1, abs(p.get('target', 1)) * 0.5)))
        else: score = _scale(v - p.get('target', 0), 0, p.get('full_gap', max(1, abs(p.get('target', 1)) * 0.5)))
        unit = f" {p['unit']}" if p.get('unit') else ''
        txt = f"{label}: {v:g}{unit} (as of {_d(f['as_of_date'])})."
    return CatResult(code, score, 'verified' if f['validation_status'] == 'valid' else 'provisional', txt, dict(value=_f(f['value_num'])),
                     [('fact', f['id'], f['source_file_id'])])


FACTOR_SCORERS = {
    'learning_trend': learning_trend, 'foundational_gap': foundational_gap, 'language_gap': language_gap, 'maths_gap': maths_gap,
    'low_class_average': low_class_average, 'test_participation': test_participation, 'hotspot_class': hotspot_class,
    'critical_open_issues': critical_open_issues, 'issue_age': issue_age, 'actions_not_completed': actions_not_completed,
    'visit_frequency': visit_frequency, 'teachers_unobserved': teachers_unobserved, 'new_teacher_support': new_teacher_support,
    'data_freshness': data_freshness, 'attendance_gap': attendance_gap, 'attendance_trend': attendance_trend,
    'pupil_teacher_ratio': pupil_teacher_ratio, 'teaching_load': teaching_load,
}
