"""Deterministic category scorers. Each returns a CatResult with a 0-100 score (or None when evidence is missing).

Statuses: verified (counts fully), provisional (counts, but evidence has flagged issues), unknown (no evidence; NOT zero), review (only
conflicting/invalid evidence; needs the CRP).
"""
from dataclasses import dataclass, field

NEED_LABEL = {
    'FLN_READING': 'foundational reading', 'NUMERACY_BASIC': 'basic numeracy', 'ENGLISH_SPEAKING': 'spoken English', 'LESSON_PLANNING': 'lesson planning',
    'TLM_USAGE': 'use of teaching-learning material', 'CLASS_PARTICIPATION': 'student participation', 'ASSESSMENT_PRACTICE': 'assessment record keeping',
    'MULTIGRADE_MGMT': 'multi-grade classroom management', 'SCIENCE_PRACTICALS': 'science practicals', 'WRITING_SKILLS': 'writing skills',
    'ATTENDANCE_IRREGULAR': 'irregular student attendance', 'GOOD_PRACTICE': 'good practice',
}


@dataclass
class CatResult:
    code: str
    score: float | None
    status: str
    explanation: str
    detail: dict = field(default_factory=dict)
    inputs: list = field(default_factory=list)      # (record_type, record_id, source_file_id)


@dataclass
class Ctx:
    kind: str                # 'school' | 'teacher'
    school: dict
    teacher: dict | None
    assessments: list
    observations: list
    follow_ups: list
    visits: list
    as_of: object
    params: dict             # category code -> rule_params (with config overrides applied)

    @property
    def classroom_visits(self): return [v for v in self.visits if v['visit_type'] == 'classroom_observation']


def _d(d): return d.strftime('%d %b %Y')


def learning_gap(c: Ctx) -> CatResult:
    ok = [a for a in c.assessments if a['validation_status'] == 'valid' and a['students_assessed'] and a['students_assessed'] > 0]
    flagged = [a for a in c.assessments if a['validation_status'] in ('conflict', 'needs_review', 'invalid')]
    latest = {}
    for a in sorted(ok, key=lambda a: (a['assessment_date'], str(a['id']))):
        latest[(a['class_no'], a['subject'], a['skill'])] = a
    rows = list(latest.values())
    if not rows:
        return CatResult('learning_gap', None, 'review' if flagged else 'unknown',
                         'Only conflicting or invalid results are available.' if flagged else 'No usable assessment results.')
    assessed = sum(a['students_assessed'] for a in rows); below = sum(a['students_below'] for a in rows)
    gap = 100.0 * below / assessed
    worst = max(rows, key=lambda a: a['students_below'] / a['students_assessed'])
    wp = 100.0 * worst['students_below'] / worst['students_assessed']
    dates = sorted({a['assessment_date'] for a in rows})
    note = f" ({len(flagged)} flagged result{'s' if len(flagged) != 1 else ''} excluded)" if flagged else ''
    full = c.params['learning_gap'].get('full_score_at_gap_pct', 100)   # 100 = score equals the raw gap %; calibrate if needed
    return CatResult('learning_gap', round(min(100.0, gap * 100.0 / full), 2), 'provisional' if flagged else 'verified',
                     f"{gap:.0f}% of {assessed} assessed students are below the benchmark; highest in Class {worst['class_no']} {worst['subject']} ({wp:.0f}%){note}.",
                     dict(gap_pct=round(gap, 1), assessed=assessed, below=below, latest_test=str(dates[-1]), excluded=len(flagged)),
                     [('assessment', a['id'], a['source_file_id']) for a in rows])


def _threads(obs):
    """Group real observations into issue threads; latest record of each thread decides its status."""
    th = {}
    for o in sorted(obs, key=lambda o: (o['observation_date'], str(o['id']))):
        th.setdefault((o['need_code'], o['teacher_id'], o['class_label']), []).append(o)
    return th


def _real(c: Ctx):
    return [o for o in c.observations if o['validation_status'] == 'valid']


def unresolved_issue(c: Ctx) -> CatResult:
    allv = _real(c)
    if not allv:
        return CatResult('unresolved_issue', None, 'unknown', 'No classroom observations recorded yet.')
    issues = [o for o in allv if o['severity'] != 'none' and o['need_code'] != 'GOOD_PRACTICE']
    rubric = c.params['unresolved_issue']['rubric']
    open_threads = []
    for key, lst in _threads(issues).items():
        last = lst[-1]
        if last['status'] in ('open', 'in_progress'):
            open_threads.append(last)
    if not open_threads:
        return CatResult('unresolved_issue', float(rubric['none']), 'verified', 'No unresolved issues on record.',
                         inputs=[('observation', o['id'], o['source_file_id']) for o in allv[-3:]])
    order = {'minor': 1, 'significant': 2, 'critical': 3}
    top = max(open_threads, key=lambda o: order[o['severity']])
    sev = top['severity']
    labels = sorted({f"{NEED_LABEL.get(o['need_code'], o['need_code'])} ({o['severity']})" for o in open_threads})
    return CatResult('unresolved_issue', float(rubric[sev]), 'verified',
                     f"{len(open_threads)} unresolved issue{'s' if len(open_threads) != 1 else ''}; most serious is {sev}: {NEED_LABEL.get(top['need_code'])}.",
                     dict(open=len(open_threads), top_severity=sev, issues=labels),
                     [('observation', o['id'], o['source_file_id']) for o in open_threads])


def overdue_followup(c: Ctx) -> CatResult:
    fus = c.follow_ups
    tiers = c.params['overdue_followup']['tiers']
    if not fus:
        if c.classroom_visits:
            return CatResult('overdue_followup', 0.0, 'verified', 'No follow-ups were required after the recorded visits.')
        return CatResult('overdue_followup', None, 'unknown', 'No follow-up records and no classroom visits yet.')
    overdue = [(f, (c.as_of - f['due_date']).days) for f in fus if f['status'] == 'open' and f['due_date'] < c.as_of]
    if not overdue:
        nxt = [f for f in fus if f['status'] == 'open']
        txt = f"All follow-ups are on time; next due {_d(min(f['due_date'] for f in nxt))}." if nxt else 'All follow-ups are completed.'
        return CatResult('overdue_followup', 0.0, 'verified', txt, inputs=[('follow_up', f['id'], f['plan_file_id']) for f in fus])
    worst_f, days = max(overdue, key=lambda x: x[1])
    score = next(t['score'] for t in tiers if t['max_days'] is None or days <= t['max_days'])
    return CatResult('overdue_followup', float(score), 'verified',
                     f"{len(overdue)} follow-up{'s' if len(overdue) != 1 else ''} overdue; the longest is {days} days late ({(worst_f['action'] or 'agreed action').lower()}).",
                     dict(overdue=len(overdue), max_days=days, items=[dict(days=d, due=str(f['due_date']), action=f['action']) for f, d in sorted(overdue, key=lambda x: -x[1])]),
                     [('follow_up', f['id'], f['plan_file_id']) for f, d in overdue])


def time_since_visit(c: Ctx) -> CatResult:
    p = c.params['time_since_visit']
    interval, full = p['expected_interval_days'], p['full_score_after_days']
    vs = c.visits if c.kind == 'school' else c.classroom_visits
    if vs:
        last = max(vs, key=lambda v: v['visit_date'])
        days = (c.as_of - last['visit_date']).days
        never, txt = False, f"Last visit {days} days ago ({_d(last['visit_date'])}); expected every {interval} days."
        inputs = [('visit', last['id'], last['source_file_id'])]
    else:
        if c.kind == 'school':
            return CatResult('time_since_visit', None, 'unknown', 'No visits recorded.')
        days = (c.as_of - c.teacher['joined_date']).days
        never, inputs = True, []
        txt = f"Never observed; {days} days since joining on {_d(c.teacher['joined_date'])}."
    score = 0.0 if days <= interval else min(100.0, 100.0 * (days - interval) / (full - interval))
    return CatResult('time_since_visit', round(score, 2), 'verified', txt, dict(days=days, never_observed=never), inputs)


def recurring_need(c: Ctx) -> CatResult:
    allv = _real(c)
    if not allv:
        return CatResult('recurring_need', None, 'unknown', 'No observations recorded yet.')
    issues = [o for o in allv if o['severity'] != 'none' and o['need_code'] != 'GOOD_PRACTICE']
    rubric = {int(k): v for k, v in c.params['recurring_need']['distinct_dates_rubric'].items()}
    by = {}
    for o in issues:
        by.setdefault(o['need_code'], set()).add(o['observation_date'])
    if not by:
        return CatResult('recurring_need', 0.0, 'verified', 'No issues recorded, so nothing is recurring.')
    need, dates = max(by.items(), key=lambda kv: (len(kv[1]), kv[0]))
    n = len(dates)
    score = rubric[max(k for k in rubric if k <= n)] if n >= min(rubric) else 0
    ins = [('observation', o['id'], o['source_file_id']) for o in issues if o['need_code'] == need]
    if n >= 2:
        txt = f"{NEED_LABEL.get(need, need).capitalize()} was raised on {n} separate dates ({', '.join(_d(d) for d in sorted(dates))})."
    else:
        txt = 'No issue has been raised on more than one date.'
    return CatResult('recurring_need', float(score), 'verified', txt, dict(need=need, dates=n), ins)


SCORERS = {'learning_gap': learning_gap, 'unresolved_issue': unresolved_issue, 'overdue_followup': overdue_followup,
           'time_since_visit': time_since_visit, 'recurring_need': recurring_need}

