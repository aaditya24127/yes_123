"""Turns a confirmed upload into records the ranking uses: assessments, observations, actions + follow-ups, visits,
attendance, teachers and facts. Every record keeps a link to its file and where in the file it came from (locator).

Spreadsheets and CSVs are read by free rules. Narrative documents, scans, photos and transcribed recordings are read by
Claude when a key is set; without a key the file is still stored (and its text kept for the AI assistant) but no records
are created from it, and the CRP is told so.
"""
import datetime as dt, difflib, hashlib, json, re
from . import readers
from ... import ai
from ..prioritization.scorers import NEED_LABEL

BENCHMARK = 40


# ---------------------------------------------------------------- small helpers
def _num(v):
    if v is None: return None
    s = str(v).strip().replace('%', '').replace(',', '')
    if s in ('', '-', 'NA', 'N/A', 'na'): return None
    try: return float(s)
    except ValueError: return None


def _int(v):
    n = _num(v)
    return None if n is None else int(round(n))


def _find_header(rows, needed, min_hits=3):
    """Index of the first row that contains at least `min_hits` of the header keywords."""
    for i, r in enumerate(rows[:40]):
        low = [c.lower() for c in r]
        hits = sum(1 for k in needed if any(k in c for c in low))
        if hits >= min_hits: return i
    return None


def _colmap(header, synonyms):
    """synonyms: {field: [keywords]} -> {field: column index}; first matching keyword wins, each column used once."""
    low = [c.lower().strip() for c in header]; used = set(); out = {}
    for field, keys in synonyms.items():
        for k in keys:
            j = next((j for j, c in enumerate(low) if j not in used and (c == k or k in c)), None)
            if j is not None:
                out[field] = j; used.add(j); break
    return out


def _get(row, cm, field):
    j = cm.get(field)
    return row[j].strip() if j is not None and j < len(row) and row[j] is not None else ''


def match_teacher(name, teachers):
    if not name or name.strip() in ('-', ''): return None
    n = re.sub(r'^(mr|mrs|ms|miss|dr|smt|shri)\.?\s+', '', name.strip().lower())
    by = {t['full_name'].lower(): t for t in teachers}
    if n in by: return by[n]
    close = difflib.get_close_matches(n, list(by), n=1, cutoff=0.82)
    return by[close[0]] if close else None


# ---------------------------------------------------------------- table parsers (free)
RESULT_SYN = {'class_no': ['class', 'std', 'standard', 'grade'], 'division': ['div', 'division', 'section'], 'subject': ['subject'],
              'skill': ['skill'], 'teacher': ['teacher'], 'on_roll': ['on roll', 'students_on_roll', 'enrolled', 'roll'],
              'assessed': ['assessed', 'appeared', 'students_assessed', 'present'], 'below': ['below', 'students_below'],
              'max_marks': ['max'], 'avg': ['avg', 'average', 'class_avg'], 'date': ['test date', 'test_date', 'date'], 'exam': ['exam', 'test name']}
ATT_SYN = {'month': ['month'], 'days': ['working'], 'pct': ['attendance %', 'avg_daily', 'average daily', 'attendance'], 'target': ['target']}
FU_SYN = {'ref': ['action id', 'id', 'sr'], 'issue': ['issue', 'need'], 'action': ['action agreed', 'action'], 'responsible': ['responsible', 'teacher', 'owner'],
          'start': ['agreed on', 'start', 'created'], 'due': ['due'], 'status': ['status'], 'done_on': ['completed on', 'completed_on', 'done on'], 'remarks': ['remark', 'evidence']}
ROSTER_SYN = {'name': ['teacher', 'name'], 'designation': ['designation', 'post'], 'qualification': ['qualification'], 'joined': ['joined', 'joining'],
              'classes': ['classes', 'class'], 'subjects': ['subjects', 'subject']}
VISIT_SYN = {'date': ['date'], 'teacher': ['teacher'], 'class': ['class'], 'subject': ['subject'], 'type': ['visit_type', 'visit type', 'type'], 'remarks': ['remark']}
FACT_SYN = {'girls_enrolled': ['girls'], 'enrolment_total': ['total enrol', 'enrolment', 'enrollment', 'total students', 'students on roll'],
            'cwsn_enrolled': ['cwsn', 'special needs']}


def parse_results(tables, ctx):
    out = []
    for t in tables:
        rows = t['rows']; h = _find_header(rows, ['class', 'subject', 'assessed', 'below', 'roll', 'appeared'], 3)
        if h is None: continue
        cm = _colmap(rows[h], RESULT_SYN)
        if not {'class_no', 'subject', 'assessed', 'below'} <= set(cm): continue
        meta_exam = next((r[1] for r in rows[:h] if r and r[0].lower().startswith(('exam', 'test'))), '')
        for i, r in enumerate(rows[h + 1:], h + 2):
            if not any(r): continue
            cls = _int(_get(r, cm, 'class_no'))
            if cls is None: continue
            loc = f"Sheet '{t['name']}', row {i}" if t['name'] != 'CSV' else f'row {i}'
            out.append(dict(class_no=cls, division=_get(r, cm, 'division') or None, subject=_get(r, cm, 'subject'), skill=_get(r, cm, 'skill') or None,
                            teacher_name_raw=_get(r, cm, 'teacher') or None, students_on_roll=_int(_get(r, cm, 'on_roll')),
                            students_assessed=_int(_get(r, cm, 'assessed')), students_below=_int(_get(r, cm, 'below')), max_marks=_num(_get(r, cm, 'max_marks')),
                            class_avg_pct=_num(_get(r, cm, 'avg')), assessment_date=readers.parse_date(_get(r, cm, 'date')) or ctx['record_date'],
                            exam_type=_get(r, cm, 'exam') or meta_exam or None, locator=loc, evidence_text=' | '.join(c for c in r if c)[:300], confidence=1.0))
    return out


def parse_attendance(tables, ctx):
    out = []
    for t in tables:
        rows = t['rows']; h = _find_header(rows, ['month', 'attendance', 'working', 'target'], 2)
        if h is None: continue
        cm = _colmap(rows[h], ATT_SYN)
        if not {'month', 'pct'} <= set(cm): continue
        tgt_default = next((_num(r[1]) for r in rows[:h] if r and 'target' in r[0].lower()), None) or 90
        for i, r in enumerate(rows[h + 1:], h + 2):
            m = _get(r, cm, 'month'); pct = _num(_get(r, cm, 'pct'))
            mm = re.match(r'(20\d\d)-(\d{1,2})', m) or None
            if not mm:
                d = readers.parse_date('1 ' + m) if m else None
                m = f'{d:%Y-%m}' if d else ''
            else:
                m = f'{mm[1]}-{int(mm[2]):02d}'
            if not m or pct is None: continue
            out.append(dict(month=m, working_days=_int(_get(r, cm, 'days')), avg_attendance_pct=pct, target_pct=_num(_get(r, cm, 'target')) or tgt_default,
                            locator=f"Sheet '{t['name']}', row {i}" if t['name'] != 'CSV' else f'row {i}'))
    return out


def parse_followups(tables, ctx):
    out = []
    for t in tables:
        rows = t['rows']; h = _find_header(rows, ['action', 'due', 'status', 'responsible'], 3)
        if h is None: continue
        cm = _colmap(rows[h], FU_SYN)
        for i, r in enumerate(rows[h + 1:], h + 2):
            act = _get(r, cm, 'action')
            if not act: continue
            st = _get(r, cm, 'status').lower()
            status = 'completed' if 'complet' in st or 'done' in st else 'not_completed' if 'not' in st else 'open'
            out.append(dict(ref=_get(r, cm, 'ref'), issue=_get(r, cm, 'issue'), action=act, responsible=_get(r, cm, 'responsible'),
                            start=readers.parse_date(_get(r, cm, 'start')) or ctx['record_date'], due=readers.parse_date(_get(r, cm, 'due')), status=status,
                            done_on=readers.parse_date(_get(r, cm, 'done_on')), remarks=_get(r, cm, 'remarks'),
                            locator=f"Sheet '{t['name']}', row {i}" if t['name'] != 'CSV' else f'row {i}'))
    return out


def parse_roster(tables, ctx):
    out = []
    for t in tables:
        rows = t['rows']; h = _find_header(rows, ['teacher', 'name', 'qualification', 'joined', 'classes', 'subjects'], 3)
        if h is None: continue
        cm = _colmap(rows[h], ROSTER_SYN)
        for i, r in enumerate(rows[h + 1:], h + 2):
            n = _get(r, cm, 'name')
            if not n: continue
            out.append(dict(name=n, designation=_get(r, cm, 'designation') or 'Assistant Teacher', qualification=_get(r, cm, 'qualification') or None,
                            joined=readers.parse_date(_get(r, cm, 'joined')), classes=[int(x) for x in re.findall(r'\d+', _get(r, cm, 'classes'))],
                            subjects=[s.strip() for s in re.split(r'[,;/]', _get(r, cm, 'subjects')) if s.strip()], row=i))
    return out


def parse_visit_log(tables, ctx):
    out = []
    for t in tables:
        rows = t['rows']; h = _find_header(rows, ['date', 'teacher', 'visit', 'class'], 2)
        if h is None: continue
        cm = _colmap(rows[h], VISIT_SYN)
        for i, r in enumerate(rows[h + 1:], h + 2):
            d = readers.parse_date(_get(r, cm, 'date'))
            if not d: continue
            vt = 'classroom_observation' if 'class' in _get(r, cm, 'type').lower() or 'observ' in _get(r, cm, 'type').lower() else 'school_visit'
            out.append(dict(date=d, teacher=_get(r, cm, 'teacher'), class_no=_int(_get(r, cm, 'class')), subject=_get(r, cm, 'subject') or None, visit_type=vt, row=i))
    return out


def parse_facts(tables, ctx):
    """Two layouts: 'label | value' rows for one school, or a table with one school per row (each row is matched to its own school)."""
    from .sorter import match_school
    out = []
    for t in tables:
        h = _find_header(t['rows'], ['girls', 'boys', 'total', 'cwsn', 'enrol'], 2)
        if h is not None:                                  # table layout
            cm = _colmap(t['rows'][h], FACT_SYN)
            name_col = next((j for j, c in enumerate(t['rows'][h]) if any(k in c.lower() for k in ('school', 'name', 'udise'))), None)
            for i, r in enumerate(t['rows'][h + 1:], h + 2):
                if not any(r): continue
                sid = None
                if name_col is not None and name_col < len(r) and r[name_col]:
                    s, score, _ = match_school(r[name_col], ctx.get('all_schools', []))
                    if not s or score < 0.6: continue          # a row for a school we cannot recognise is skipped (reported below)
                    sid = s['id']
                for key in cm:
                    v = _num(_get(r, cm, key))
                    if v is not None: out.append(dict(fact_key=key, value_num=v, school_id=sid, locator=f"Sheet '{t['name']}', row {i}"))
            continue
        for i, r in enumerate(t['rows'][:60], 1):           # label | value layout
            if len(r) >= 2 and r[0]:
                for key, syn in FACT_SYN.items():
                    if any(s in r[0].lower() for s in syn) and _num(r[1]) is not None:
                        out.append(dict(fact_key=key, value_num=_num(r[1]), locator=f"Sheet '{t['name']}', row {i}"))
    return out


# ---------------------------------------------------------------- AI reading of documents, scans and transcripts
def ai_extract(rr, data, ctx, transcript=None, fact_keys=()):
    """Returns (records dict or None, warning or None, provider name). Which AI reads is decided in config/ai.json."""
    inp = dict(school=f"{ctx['school']['name']} ({ctx['school']['code']})", teachers=[t['full_name'] for t in ctx['teachers']], section=ctx['section'],
               filename=ctx['filename'], record_date=str(ctx['record_date']) if ctx['record_date'] else None, fact_keys=list(fact_keys))
    att, task = [], 'extract_records'
    if transcript:
        inp['transcript'] = '\n'.join(f"[{_mmss(s['start'])}-{_mmss(s['end'])}] {s['text']}" for s in transcript['segments']) or transcript['text']
    elif rr.text:
        inp['text'] = rr.text
    elif rr.fmt == 'pdf' or rr.fmt in readers.IMAGE:
        task = 'extract_records_scan'
        att = [ai.Attachment(ctx['filename'], readers.MIME[rr.fmt], data)]
    else:
        return None, 'Nothing readable in this file.', None
    try:
        res = ai.run(task, inp, att)
    except ai.AIUnavailable as e:
        return None, f'Could not read this file with AI ({e}).', None
    if res.provider == 'rules':
        return None, res.data['summary'], 'rules'
    return res.data, None, res.provider


def _mmss(s): return f'{int(s // 60):02d}:{int(s % 60):02d}'


# ---------------------------------------------------------------- writing records (with validation)
def _validate_assessment(a):
    on, asd, below = a.get('students_on_roll'), a.get('students_assessed'), a.get('students_below')
    if asd is None or below is None: return 'needs_review', 'Missing assessed or below-benchmark count'
    if below > asd: return 'invalid', 'More students below benchmark than assessed'
    if on is not None and asd > on: return 'invalid', 'More students assessed than on roll'
    if asd == 0: return 'invalid', 'No students assessed'
    if a.get('confidence', 1) < 0.7: return 'needs_review', 'AI was not sure when reading this row'
    return 'valid', None


def write_records(conn, item, sf_id, school, teachers, parsed, kind, ctx):
    """Inserts parsed records; returns counts and warnings. `kind` says which parser produced `parsed`."""
    counts, warn = {}, []
    sid = school['id']
    def bump(k, n=1): counts[k] = counts.get(k, 0) + n

    if kind == 'results':
        for a in parsed:
            t = match_teacher(a.get('teacher_name_raw'), teachers) or (ctx.get('teacher'))
            st, note = _validate_assessment(a)
            same = conn.execute("""select id, students_assessed, students_below from assessments where school_id = %s and class_no = %s and subject = %s
                                   and coalesce(skill,'') = coalesce(%s,'') and assessment_date = %s and validation_status in ('valid','conflict') and source_file_id <> %s""",
                                (sid, a['class_no'], a['subject'], a.get('skill'), a.get('assessment_date'), sf_id)).fetchone()
            dup_of = None
            if same and st == 'valid':
                if same['students_assessed'] == a['students_assessed'] and same['students_below'] == a['students_below']:
                    st, note, dup_of = 'duplicate', 'Same figures already uploaded', same['id']
                else:
                    st, note = 'conflict', f"Differs from an earlier upload ({same['students_below']}/{same['students_assessed']} vs {a['students_below']}/{a['students_assessed']})"
                    conn.execute("update assessments set validation_status = 'conflict', validation_note = %s where id = %s", ('Differs from a later upload', same['id']))
                    warn.append(f"Class {a['class_no']} {a['subject']}: figures disagree with an earlier file; marked for review.")
            conn.execute("""insert into assessments (school_id, teacher_id, teacher_name_raw, class_no, division, subject, skill, exam_type, assessment_date, max_marks,
                            students_on_roll, students_assessed, students_below, class_avg_pct, source_file_id, locator, evidence_text, validation_status, validation_note, is_duplicate_of)
                            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                         (sid, t['id'] if t else None, a.get('teacher_name_raw'), a['class_no'], a.get('division'), a['subject'], a.get('skill'), a.get('exam_type'),
                          a.get('assessment_date'), a.get('max_marks'), a.get('students_on_roll'), a.get('students_assessed'), a.get('students_below'), a.get('class_avg_pct'),
                          sf_id, a['locator'], a.get('evidence_text'), st, note, dup_of))
            bump('assessments'); bump(f'assessments_{st}')
    elif kind == 'attendance':
        for a in parsed:
            conn.execute("""insert into attendance (school_id, month, working_days, avg_attendance_pct, target_pct, source_file_id, locator) values (%s,%s,%s,%s,%s,%s,%s)
                            on conflict (school_id, month) do update set working_days = excluded.working_days, avg_attendance_pct = excluded.avg_attendance_pct,
                            target_pct = excluded.target_pct, source_file_id = excluded.source_file_id, locator = excluded.locator""",
                         (sid, a['month'], a['working_days'], a['avg_attendance_pct'], a['target_pct'], sf_id, a['locator']))
            bump('attendance_months')
    elif kind == 'followups':
        for f in parsed:
            t = match_teacher(f['responsible'], teachers) or ctx.get('teacher')
            ex = conn.execute("""select i.id, fu.id as fu_id from interventions i left join follow_ups fu on fu.intervention_id = i.id
                                 where i.school_id = %s and lower(coalesce(i.approved_action, i.recommended_action)) = lower(%s) and coalesce(i.teacher_id::text,'') = coalesce(%s::text,'')
                                 order by i.created_on desc limit 1""", (sid, f['action'], t['id'] if t else None)).fetchone()
            ivs = {'completed': 'completed', 'not_completed': 'not_completed'}.get(f['status'], 'approved')
            if ex:
                conn.execute('update interventions set status = %s, planned_completion = coalesce(%s, planned_completion) where id = %s', (ivs, f['due'], ex['id']))
                if ex['fu_id']:
                    conn.execute("""update follow_ups set status = %s, completed_date = %s, completion_evidence = nullif(%s,''), completion_source_file_id = %s,
                                    completion_locator = %s where id = %s""", (f['status'], f['done_on'], f['remarks'], sf_id if f['status'] == 'completed' else None,
                                                                              f['locator'] if f['status'] == 'completed' else None, ex['fu_id']))
                bump('actions_updated')
            else:
                iid = conn.execute("""insert into interventions (school_id, teacher_id, created_on, recommended_action, approved_action, responsible, planned_completion, status, source_file_id, locator)
                                      values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                                   (sid, t['id'] if t else None, f['start'] or dt.date.today(), f['action'], f['action'], f['responsible'] or None, f['due'], ivs, sf_id, f['locator'])).fetchone()['id']
                if f['due']:
                    conn.execute("""insert into follow_ups (intervention_id, school_id, teacher_id, due_date, status, completed_date, completion_evidence, completion_source_file_id, completion_locator)
                                    values (%s,%s,%s,%s,%s,%s,nullif(%s,''),%s,%s)""",
                                 (iid, sid, t['id'] if t else None, f['due'], f['status'], f['done_on'], f['remarks'], sf_id if f['status'] == 'completed' else None,
                                  f['locator'] if f['status'] == 'completed' else None))
                bump('actions_added')
    elif kind == 'roster':
        for r in parsed:
            t = match_teacher(r['name'], teachers)
            title = (re.match(r'^(Mr|Mrs|Ms|Miss|Dr)\.?', r['name']) or [None])[0]
            clean = re.sub(r'^(Mr|Mrs|Ms|Miss|Dr|Smt|Shri)\.?\s+', '', r['name']).strip()
            if t:
                conn.execute("""update teachers set qualification = coalesce(%s, qualification), joined_date = coalesce(%s, joined_date),
                                classes_taught = case when cardinality(%s::smallint[]) > 0 then %s::smallint[] else classes_taught end,
                                subjects_taught = case when cardinality(%s::text[]) > 0 then %s::text[] else subjects_taught end where id = %s""",
                             (r['qualification'], r['joined'], r['classes'], r['classes'], r['subjects'], r['subjects'], t['id']))
                bump('teachers_updated')
            else:
                n = conn.execute('select count(*) as n from teachers where school_id = %s', (sid,)).fetchone()['n'] + 1
                code = f"{school['code']}-T{n:02d}"
                while conn.execute('select 1 from teachers where teacher_code = %s', (code,)).fetchone(): n += 1; code = f"{school['code']}-T{n:02d}"
                conn.execute("""insert into teachers (school_id, teacher_code, full_name, title, designation, qualification, joined_date, classes_taught, subjects_taught)
                                values (%s,%s,%s,%s,%s,%s,%s,%s,%s)""", (sid, code, clean, title and title + '.', r['designation'], r['qualification'], r['joined'], r['classes'], r['subjects']))
                bump('teachers_added')
    elif kind == 'visit_log':
        for v in parsed:
            t = match_teacher(v['teacher'], teachers)
            if conn.execute('select 1 from visits where school_id = %s and visit_date = %s and visit_type = %s and teacher_id is not distinct from %s',
                            (sid, v['date'], v['visit_type'], t['id'] if t else None)).fetchone():
                bump('visits_already_known'); continue
            conn.execute('insert into visits (school_id, teacher_id, visit_date, visit_type, class_no, subject, source_file_id) values (%s,%s,%s,%s,%s,%s,%s)',
                         (sid, t['id'] if t else None, v['date'], v['visit_type'], v['class_no'], v['subject'], sf_id))
            bump('visits')
    elif kind == 'facts':
        for f in parsed:
            conn.execute("insert into facts (fact_key, school_id, value_num, as_of_date, source, source_file_id, locator) values (%s,%s,%s,%s,'upload',%s,%s)",
                         (f['fact_key'], f.get('school_id') or sid, f['value_num'], ctx['record_date'] or dt.date.today(), sf_id, f['locator']))
            bump('facts')
        schools = {f.get('school_id') for f in parsed if f.get('school_id')}
        if len(schools) > 1: counts['schools'] = len(schools)
    elif kind == 'ai':
        j = parsed
        vdate = readers.parse_date(j.get('visit_date')) or ctx['record_date']
        named = [match_teacher(n, teachers) for n in j.get('teacher_names', [])]
        visit_ids = {}
        if vdate and j.get('visit_type') in ('school_visit', 'classroom_observation') and ctx['section'] in ('observations', 'visits', 'audio', 'visit_session'):
            for t in ([x for x in named if x] or [None]):
                vt = 'classroom_observation' if t and j['visit_type'] == 'classroom_observation' else 'school_visit'
                ex = conn.execute('select id from visits where school_id = %s and visit_date = %s and teacher_id is not distinct from %s', (sid, vdate, t['id'] if t else None)).fetchone()
                visit_ids[t['id'] if t else None] = ex['id'] if ex else conn.execute(
                    'insert into visits (school_id, teacher_id, visit_date, visit_type, source_file_id) values (%s,%s,%s,%s,%s) returning id',
                    (sid, t['id'] if t else None, vdate, vt, sf_id)).fetchone()['id']
                if not ex: bump('visits')
        for o in j.get('observations', []):
            t = match_teacher(o.get('teacher_name'), teachers) or ctx.get('teacher')
            dup = conn.execute("""select id from observations where school_id = %s and teacher_id is not distinct from %s and need_code = %s and observation_date = %s
                                  and validation_status = 'valid' and source_file_id <> %s limit 1""",
                               (sid, t['id'] if t else None, o['need_code'], vdate, sf_id)).fetchone() if vdate else None
            st = 'duplicate' if dup else ('needs_review' if o.get('confidence', 1) < 0.7 else 'valid')
            conn.execute("""insert into observations (school_id, teacher_id, visit_id, observation_date, need_code, issue_text, severity, status, class_label, subject,
                            extraction_origin, source_file_id, locator, evidence_text, validation_status, is_duplicate_of) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                         (sid, t['id'] if t else None, visit_ids.get(t['id'] if t else None), vdate or dt.date.today(), o['need_code'], o['issue_text'], o['severity'], o['status'],
                          o.get('class_label'), o.get('subject'), 'audio_transcript' if ctx['section'] in ('audio', 'visit_session') else 'document', sf_id, o['locator'],
                          o.get('evidence_text'), st, dup['id'] if dup else None))
            bump('observations'); bump(f'observations_{st}')
        for a in j.get('actions', []):
            t = match_teacher(a.get('teacher_name'), teachers) or ctx.get('teacher')
            due = readers.parse_date(a.get('due_date'))
            iid = conn.execute("""insert into interventions (school_id, teacher_id, created_on, recommended_action, approved_action, planned_completion, status, source_file_id, locator)
                                  values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                               (sid, t['id'] if t else None, vdate or dt.date.today(), a['action'], a['action'], due,
                                {'completed': 'completed', 'not_completed': 'not_completed'}.get(a['status'], 'approved'), sf_id, a['locator'])).fetchone()['id']
            if due:
                conn.execute('insert into follow_ups (intervention_id, school_id, teacher_id, due_date, status) values (%s,%s,%s,%s,%s)',
                             (iid, sid, t['id'] if t else None, due, a['status']))
            bump('actions_added')
        ai_rows = []
        for a in j.get('assessments', []):
            ai_rows.append(dict(class_no=a['class_no'], subject=a['subject'], skill=a.get('skill'), teacher_name_raw=a.get('teacher_name'), students_on_roll=a.get('students_on_roll'),
                                students_assessed=a.get('students_assessed'), students_below=a.get('students_below'), class_avg_pct=a.get('class_avg_pct'),
                                assessment_date=readers.parse_date(a.get('test_date')) or vdate, exam_type=a.get('exam_type'), locator=a['locator'], confidence=a.get('confidence', 1)))
        if ai_rows:
            c2, w2 = write_records(conn, item, sf_id, school, teachers, ai_rows, 'results', ctx)
            for k, v in c2.items(): bump(k, v)
            warn += w2
        for f in j.get('facts', []):
            conn.execute("insert into facts (fact_key, school_id, value_num, as_of_date, source, source_file_id, locator) values (%s,%s,%s,%s,'upload',%s,%s)",
                         (f['fact_key'], sid, f['value'], vdate or dt.date.today(), sf_id, f['locator']))
            bump('facts')
        if j.get('summary'): counts['summary'] = j['summary']
    return counts, warn


PARSERS = {'assessments': [('results', parse_results)], 'attendance': [('attendance', parse_attendance)], 'followups': [('followups', parse_followups)],
           'roster': [('roster', parse_roster)], 'visits': [('visit_log', parse_visit_log)], 'facts': [('facts', parse_facts)]}


def extract_and_write(conn, item, sf_id, school, teachers, rr, data, ctx, transcript=None):
    """Free parser first; AI only when the free parser found nothing (or the file has no text table)."""
    counts, warn, used = {}, [], 'rules'
    for kind, fn in PARSERS.get(ctx['section'], []):
        if rr.tables:
            parsed = fn(rr.tables, ctx)
            if parsed:
                c, w = write_records(conn, item, sf_id, school, teachers, parsed, kind, ctx)
                counts.update(c); warn += w
    if not counts and ctx['section'] not in ('textbooks', 'other') and (rr.text or rr.scanned or transcript):
        keys = [r['key'] for r in conn.execute('select key from fact_definitions').fetchall()]
        j, err, prov = ai_extract(rr, data, ctx, transcript, keys)
        if err: warn.append(err)
        if j:
            used = prov
            c, w = write_records(conn, item, sf_id, school, teachers, j, 'ai', ctx)
            counts.update(c); warn += w
    return dict(counts=counts, warnings=warn, read_by=used)
