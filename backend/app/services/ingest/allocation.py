"""Where the data of an uploaded file goes: which priority each piece of the file feeds, how many records, and an example.

Before Import the app only knows the kind of file, so it says what that kind feeds ("expected"). After Import it reads the records
the file really produced (every record keeps `source_file_id`) and says exactly what was taken ("done"). Plain words, one row per priority.
"""
from ..prioritization.engine import LABEL

# Per kind of file: which priorities it feeds, and which part of the file is used. (code, what is taken from the file)
EXPECTED = {
    'assessments': [('learning_gap', 'Each row of the marks sheet: class, subject, students tested, students below the benchmark')],
    'observations': [
        ('unresolved_issue', 'Each problem found in the notes, with how serious it is'),
        ('recurring_need', 'The same problem seen on two or more different dates'),
        ('overdue_followup', 'Any action that was agreed, with its due date'),
        ('time_since_visit', 'The date of the visit, if the notes say it'),
    ],
    'followups': [('overdue_followup', 'Each agreed action, its due date and whether it was done')],
    'visits': [('time_since_visit', 'Each visit date in the list')],
    'attendance': [('attendance_gap', 'Each month: average attendance and the target')],
    'facts': [('_own', 'The number given for each school')],
    'roster': [('_none', 'Teacher names, classes and subjects (used in visits and tasks, not scored)')],
}
EXPECTED['audio'] = EXPECTED['visit_session'] = EXPECTED['observations']
NOT_USED = {'textbooks': 'A textbook is linked to a teacher; it is not used to rank schools.', 'other': 'This kind of file is kept with the school but does not change any priority. Choose its kind above if it should.'}


def _names(conn):
    names = dict(LABEL)
    for r in conn.execute("select code, name from priority_categories where code = 'attendance_gap'").fetchall(): names['attendance_gap'] = r['name']
    return names


def _row(names, code, takes, records=None, example=None, counted='yes', note=None):
    return dict(code=code, priority=names.get(code, code), takes=takes, records=records, example=example, counted=counted, note=note)


def expected(conn, section):
    names = _names(conn)
    rows = []
    for code, takes in EXPECTED.get(section, []):
        if code == '_own': rows.append(_row(names, code, takes, counted='after_import', note='Goes to the priority you made for these numbers')); rows[-1]['priority'] = 'Your own priority'
        elif code == '_none': rows.append(_row(names, code, takes, counted='no', note='Not scored')); rows[-1]['priority'] = 'Teacher lists'
        else: rows.append(_row(names, code, takes, counted='after_import'))
    if not rows: rows.append(_row(names, '_none', NOT_USED.get(section, 'Nothing from this file is used for the priorities.'), counted='no')); rows[-1]['priority'] = 'No priority'
    return rows


def actual(conn, sf, result_counts=None):
    """What the records of this file feed, read from the database."""
    names = _names(conn)
    rows = []
    q = lambda sql, *a: conn.execute(sql, a).fetchall()

    # ---- test marks -> learning gap
    a = q("select validation_status st, count(*) n from assessments where source_file_id = %s group by 1", sf)
    if a:
        n = {r['st']: r['n'] for r in a}
        ex = q("select class_no, subject, students_assessed, students_below, locator from assessments where source_file_id = %s and validation_status in ('valid','conflict') order by class_no, subject limit 1", sf)
        eg = f"Class {ex[0]['class_no']} {ex[0]['subject']}: {ex[0]['students_below']} of {ex[0]['students_assessed']} students below the benchmark ({ex[0]['locator']})" if ex else None
        counted = n.get('valid', 0) + n.get('conflict', 0)
        rows.append(_row(names, 'learning_gap', 'Class, subject, students tested and students below the benchmark, from each row', counted, eg, 'yes' if counted else 'no',
                         'Also feeds the ready-made Learning trend, Reading and writing and Maths priorities, if you switch them on' + (f'. {n["conflict"]} row(s) disagree with an earlier file and wait for your check' if n.get('conflict') else '')))
        for st, why in (('duplicate', 'Same figures were already added, so they are not counted twice'), ('needs_review', 'The figures look wrong, so they wait for your check'), ('invalid', 'The row could not be used')):
            if n.get(st): rows.append(_row(names, 'learning_gap', f'{n[st]} row(s) left out', n[st], None, 'no', why)); rows[-1]['priority'] = 'Not counted'

    # ---- notes -> unresolved issue, recurring need
    o = q("select validation_status st, (need_code = 'GOOD_PRACTICE') good, count(*) n from observations where source_file_id = %s group by 1, 2", sf)
    if o:
        bad = sum(r['n'] for r in o if not r['good'] and r['st'] in ('valid', 'needs_review'))
        good = sum(r['n'] for r in o if r['good'])
        dup = sum(r['n'] for r in o if not r['good'] and r['st'] == 'duplicate')
        ex = q("select issue_text, severity, locator from observations where source_file_id = %s and need_code <> 'GOOD_PRACTICE' and validation_status = 'valid' order by case severity when 'critical' then 0 when 'significant' then 1 else 2 end limit 1", sf)
        eg = f"({ex[0]['severity']}) {ex[0]['issue_text'][:140]}" + (f" ({ex[0]['locator']})" if ex[0]['locator'] else '') if ex else None
        codes = [r['need_code'] for r in q("select distinct need_code from observations where source_file_id = %s and need_code <> 'GOOD_PRACTICE' order by 1", sf)]
        kinds = len(codes)
        kinds_eg = ', '.join(c.replace('_', ' ').lower() for c in codes[:4]) + (' ...' if kinds > 4 else '')
        if bad:
            rows.append(_row(names, 'unresolved_issue', 'Each problem found in the notes, with its seriousness (small, important or big)', bad, eg))
            rows.append(_row(names, 'recurring_need', f'The same {kinds} kind(s) of problem; counted again when seen on 2 or more dates', bad, f'Kinds of problem: {kinds_eg}', 'yes', 'Grows when the same problem appears in a later visit'))
        if good: rows.append(_row(names, '_none', 'Good practice found in the notes', good, None, 'no', 'Shown as "Going well" in the visit briefing; it does not change a score')); rows[-1]['priority'] = 'Strengths (not scored)'
        if dup: rows.append(_row(names, 'unresolved_issue', f'{dup} problem(s) left out', dup, None, 'no', 'Already on record from another file, so not counted twice')); rows[-1]['priority'] = 'Not counted'

    # ---- agreed actions -> overdue follow-up
    i = q("select count(*) n, min(planned_completion) first_due from interventions where source_file_id = %s", sf)[0]
    done = q("select count(*) n from follow_ups where completion_source_file_id = %s", sf)[0]['n']
    if i['n'] or done:
        ex = q("select approved_action, planned_completion from interventions where source_file_id = %s order by planned_completion nulls last limit 1", sf)
        eg = f"{ex[0]['approved_action'][:130]}" + (f" (due {ex[0]['planned_completion']})" if ex[0]['planned_completion'] else '') if ex else None
        rows.append(_row(names, 'overdue_followup', 'Each agreed action and its due date; a late action raises the priority' + (f'. {done} action(s) shown as done by this file' if done else ''), i['n'] + done, eg))

    # ---- visit dates -> time since last visit
    v = q("select count(*) n, max(visit_date) last from visits where source_file_id = %s", sf)[0]
    if v['n']: rows.append(_row(names, 'time_since_visit', 'Each visit date in the file', v['n'], f"Latest visit in the file: {v['last']}"))

    # ---- attendance
    t = q("select month, avg_attendance_pct, target_pct from attendance where source_file_id = %s order by month desc", sf)
    if t: rows.append(_row(names, 'attendance_gap', 'Each month: average attendance and the target', len(t), f"{t[0]['month']}: {t[0]['avg_attendance_pct']}% attendance (target {t[0]['target_pct']}%)"))

    # ---- numbers for your own priorities
    for f in q("""select f.fact_key, count(distinct f.school_id) schools, min(f.value_num) lo, max(f.value_num) hi, (array_agg(f.locator))[1] loc,
                  (select c.name from priority_categories c where c.rule_params->>'fact_key' = f.fact_key limit 1) as factor
                  from facts f where f.source_file_id = %s group by f.fact_key""", sf):
        rows.append(_row(names, '_own', f"The number for each school ({f['fact_key']})", f['schools'], f"Values from {f['lo']} to {f['hi']}" + (f" ({f['loc']})" if f['loc'] else ''), 'yes',
                         None if f['factor'] else 'No priority uses these numbers yet. Make one with the P button'))
        rows[-1]['priority'] = f"Your priority: {f['factor']}" if f['factor'] else 'Your own priority (not made yet)'

    # ---- teacher lists
    c = result_counts or {}
    if c.get('teachers_added') or c.get('teachers_updated'):
        rows.append(_row(names, '_none', 'Teacher names, classes and subjects', (c.get('teachers_added') or 0) + (c.get('teachers_updated') or 0), None, 'no', 'Used in visits and tasks; does not change a score')); rows[-1]['priority'] = 'Teacher lists (not scored)'
    return rows
