"""Builds the CRP Mentor Copilot demo dataset: files under data/schools/<school>/<section>/ + seed CSVs + ground truth."""
import csv, json, hashlib, shutil, random, datetime as dt, mimetypes, sys
from pathlib import Path
from base import *
from render import *
from audio import build_audio, mmss
from audio_scripts import SCRIPTS

WINDOW_SPLIT = D('2026-08-01')
MIME = {'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv', '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.txt': 'text/plain', '.md': 'text/markdown',
        '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg'}


def long_date(d): return f'{d.day} {d.strftime("%B %Y")}'
def dmy(d): return d.strftime('%d/%m/%Y')
def win(d): return 'W1' if d < WINDOW_SPLIT else 'W2'
def ts(d, minute=0): return f'{d.isoformat()}T18:{minute % 60:02d}:00+05:30'


# ====================================================================== text templates
SEV = {
    'minor': ['This is a minor area for improvement.', 'It is a small gap that regular practice can fix.'],
    'significant': ['This is a significant concern that needs sustained support.', 'The CRP considers this a significant concern.'],
    'critical': ['This is a critical issue that needs immediate attention.', 'The CRP regards this as critical and urgent.'],
}
TPL = {
    'FLN_READING': ["During {t}'s {cl} {subj} lesson, many students could not read simple sentences fluently and depended on memorised lines.",
                    "In {t}'s {cl} {subj} period, a large group of children could not decode simple words and read only with prompting."],
    'NUMERACY_BASIC': ["In {cl} Mathematics taught by {t}, students struggled with place value and with subtraction involving borrowing.",
                       "Several students in {t}'s {cl} Mathematics lesson could not solve two-digit addition and subtraction without counting on their fingers."],
    'ENGLISH_SPEAKING': ["Students in {cl} English with {t} answered only in one or two words and hesitated to speak in full sentences.",
                         "In {t}'s {cl} English lesson, children understood simple questions but could not reply in sentences."],
    'LESSON_PLANNING': ["{t} did not have a written lesson plan for the {cl} {subj} period, and the activities did not match the intended learning outcome.",
                        "There was no weekly lesson plan available for {cl} {subj}, and {t} could not show how the period was linked to the learning outcomes."],
    'TLM_USAGE': ["Teaching-learning material available in the school was not used in {t}'s {cl} {subj} lesson; teaching was mostly from the textbook and blackboard.",
                  "{t} taught the {cl} {subj} lesson using only the blackboard, although charts and other material were available in the school."],
    'CLASS_PARTICIPATION': ["In {t}'s {cl} {subj} lesson the teacher spoke for most of the period and students had very few chances to ask or answer questions.",
                            "Children in {cl} {subj} remained passive listeners throughout {t}'s lesson; questions from students were not encouraged."],
    'ASSESSMENT_PRACTICE': ["Progress records and unit-test answer sheets for {cl} {subj} were not maintained properly by {t}; marks had not been entered in the register.",
                            "{t} could not show the marks register or corrected answer sheets for {cl} {subj}, so student progress is not being tracked."],
    'MULTIGRADE_MGMT': ["{t} teaches {cl} together, and while one group was being taught the other group sat without a task for a large part of the period.",
                        "In the combined {cl} class handled by {t}, the second group had no self-study task while the first group was taught."],
    'SCIENCE_PRACTICALS': ["No practical or demonstration was done in {t}'s {cl} Science lesson, and the science kit was lying unused.",
                           "{t} taught the {cl} Science lesson only from the textbook; the school's science kit was not opened for any demonstration."],
    'WRITING_SKILLS': ["Many students in {t}'s {cl} {subj} lesson copied from the board but could not write a few sentences on their own.",
                       "In {cl} {subj}, students taught by {t} could copy text but struggled to express their own ideas in writing."],
    'ATTENDANCE_IRREGULAR': ["Student attendance was low during the visit, and the register shows that many children in {cl} are absent for several days every week.",
                             "Irregular attendance is a worry: the registers for {cl} show a pattern of repeated absence by a large group of children."],
    'GOOD_PRACTICE': ["{t} organised children of {cl} into reading pairs and kept a small reading corner, a good practice other teachers can adopt.",
                      "{t} conducted the {cl} {subj} lesson in clear steps with regular questions to students; no concern was noted."],
}
ACTION = {
    'FLN_READING': 'Hold 30 minutes of daily guided reading in small groups and maintain a reading-level chart',
    'NUMERACY_BASIC': 'Use concrete material such as bundles of sticks and place-value cards, and conduct weekly oral number drills',
    'ENGLISH_SPEAKING': 'Begin each English period with five minutes of picture-based speaking practice',
    'LESSON_PLANNING': 'Prepare weekly lesson plans linked to learning outcomes and show them to the Headmaster every Monday',
    'TLM_USAGE': 'Use at least one teaching-learning material from the school stock in every period',
    'CLASS_PARTICIPATION': 'Introduce question-and-answer rounds and pair work in every period',
    'ASSESSMENT_PRACTICE': 'Update the progress register and submit unit-test marks to the CRP',
    'MULTIGRADE_MGMT': 'Prepare self-study tasks for the second group and rotate groups during the period',
    'SCIENCE_PRACTICALS': 'Conduct one demonstration from the science kit every week',
    'WRITING_SKILLS': 'Give a daily five-sentence writing task with teacher feedback',
    'ATTENDANCE_IRREGULAR': 'Hold a parent meeting and start a home-visit routine for children who are absent',
}
INTRO = [
    "I visited {school} on {date} as part of my regular cluster visits and observed {n} lessons. The Headmaster and the teachers concerned were present throughout the visit.",
    "On {date} I spent the school day at {school}. I sat in on {lessons} and discussed my observations with the teachers afterwards.",
    "This report records my visit to {school} on {date}. During the visit I observed {lessons} and went through the available school records.",
]
SMALL = {'minor': 'Minor', 'significant': 'Significant', 'critical': 'Critical', 'none': 'None (good practice)'}


# ====================================================================== registries
FILES, VISITS, ASSESS, OBS, INTV, FUP, ATT = [], [], [], [], [], [], []
AUDIO_META = {}
random.seed(1)


def folder(code): return DATA / SBY[code]['folder']


def add_file(code, section, fname, writer, kind, rec_date, teacher=None, notes='', dup_of=None, duration=None, scanned=False, status='validated', minute=0):
    d = folder(code) / section; d.mkdir(parents=True, exist_ok=True)
    path = d / fname
    writer(path)
    b = path.read_bytes()
    ext = path.suffix.lower()
    f = dict(id=uid('file', code, section, fname), school=code, teacher=teacher, section=section, filename=fname,
             path=path.relative_to(ROOT).as_posix(), mime=MIME[ext], fmt=ext.lstrip('.'), size=len(b), sha=hashlib.sha256(b).hexdigest(),
             kind=kind, scanned=scanned, record_date=rec_date, uploaded_at=ts(rec_date, 10 + minute), duration=duration,
             status=status, dup_of=dup_of, notes=notes)
    FILES.append(f); return f


# ====================================================================== assessments
ASSESS_CLASSES = {'S01': [2, 3, 6], 'S02': [3, 5, 8], 'S03': [2, 3, 5], 'S04': [3, 6, 9], 'S06': [5, 7, 9], 'S07': [3, 5, 8], 'S08': [2, 3, 6], 'S10': [3, 6, 9]}
GAP = {'S01': {'W1': 52}, 'S02': {'W1': 45, 'W2': 44}, 'S03': {'W1': 11}, 'S04': {'W1': 9, 'W2': 8}, 'S06': {'W1': 28, 'W2': 29},
       'S07': {'W1': 30, 'W2': 31}, 'S08': {'W1': 38, 'W2': 22}, 'S10': {'W1': 33}}
TEST_DATE = {('S01', 'W1'): '2026-06-29', ('S02', 'W1'): '2026-06-30', ('S03', 'W1'): '2026-06-29', ('S04', 'W1'): '2026-06-30', ('S06', 'W1'): '2026-07-01',
             ('S07', 'W1'): '2026-06-30', ('S08', 'W1'): '2026-06-30', ('S10', 'W1'): '2026-07-01', ('S02', 'W2'): '2026-09-02', ('S04', 'W2'): '2026-09-01',
             ('S06', 'W2'): '2026-09-01', ('S07', 'W2'): '2026-09-02', ('S08', 'W2'): '2026-09-03'}
ADJ = {'Mathematics': 6, 'English': 3, 'EVS': -3, 'Science': 2, 'Social Science': -2, 'Hindi': 1, 'Marathi': 0}
OVERRIDE = {('S01', 'W1', 2, 'Marathi'): (52, 31), ('S08', 'W1', 3, 'Marathi'): (55, 22), ('S08', 'W2', 3, 'Marathi'): (55, 11),
            ('S07', 'W1', 5, 'Mathematics'): (50, 18)}
ENROL_OVR = {('S08', 3): 56, ('S01', 2): 55, ('S07', 5): 50}
EXAM = {'W1': ('First Unit Test', 25), 'W2': ('First Term Examination', 50)}


def skill_for(subj, cls):
    return {'Marathi': 'reading' if cls <= 5 else 'writing', 'Hindi': 'reading', 'English': 'reading comprehension',
            'Mathematics': 'number operations' if cls <= 5 else 'problem solving'}.get(subj, 'concept understanding')


def enrol(code, cls):
    return ENROL_OVR.get((code, cls)) or random.Random(int(uid('enrol', code, cls)[:8], 16)).randint(45, 60)


def make_assess(code, w):
    rows, exam_type, mx = [], *EXAM[w]
    d = D(TEST_DATE[(code, w)])
    for cls in ASSESS_CLASSES[code]:
        for subj in subjects_for(SBY[code], cls):
            rg = random.Random(int(uid('gap', code, w, cls, subj)[:8], 16))
            en = enrol(code, cls)
            if (code, w, cls, subj) in OVERRIDE:
                a, b = OVERRIDE[(code, w, cls, subj)]
            else:
                gap = max(2, min(85, GAP[code][w] + ADJ.get(subj, 0) + rg.gauss(0, 4)))
                a = en - rg.randint(0, 3); b = round(gap / 100 * a)
            t = teacher_for(code, cls, subj)
            assert t, (code, cls, subj)
            rows.append(dict(id=uid('assessment', code, w, cls, subj), school=code, teacher=t, teacher_raw=tname(t), cls=cls, subj=subj, skill=skill_for(subj, cls),
                             exam=exam_type, date=d, max=mx, enrol=en, assessed=a, below=b, avg=max(22, min(90, round(74 - 0.5 * (100 * b / a if a else 0) + rg.gauss(0, 3)))),
                             status='valid', note='', dup_of=None, file=None, locator=None, evidence=None, w=w))
    return rows


def a_evidence(r): return f"Class {r['cls']} | {r['subj']} | {r['skill']} | on roll {r['enrol']} | assessed {r['assessed']} | below 40%: {r['below']}"


ATABLE_HDR = ['Sr.', 'Class', 'Div', 'Subject', 'Skill assessed', 'Subject teacher', 'On roll', 'Assessed', 'Below 40%', 'Max marks', 'Avg %', 'Test date']
ATABLE_W = [11, 12, 8, 21, 21, 24, 10, 13, 12, 10, 9, 19]


def a_row(i, r): return [i, r['cls'], 'A', r['subj'], r['skill'], r['teacher_raw'], r['enrol'], r['assessed'], r['below'], r['max'], r['avg'], dmy(r['date'])]


def assess_xlsx_file(code, rows, fname, rec_date, extra_notes=None):
    sc = SBY[code]
    meta = [('School', sc['name']), ('Board / Medium', f"{sc['board']} / {sc['medium']}"), ('Examination', rows[0]['exam']),
            ('Benchmark', 'Students scoring below 40% of maximum marks'), ('Prepared for', f"{CRP['title']} {CRP['name']}, CRP, {CRP['cluster']}")]
    sh = dict(name='Class-wise Results', meta=meta, header=ATABLE_HDR, rows=[a_row(i + 1, r) for i, r in enumerate(rows)], widths=ATABLE_W)
    sheets = [sh]
    if extra_notes:
        sheets.append(dict(name='Notes', header=['Note'], rows=[[n] for n in extra_notes], widths=[100]))
    starts = {}

    def w(p):
        starts.update(save_xlsx(p, sheets))
    f = add_file(code, 'assessments', fname, w, 'tabular', rec_date)
    for i, r in enumerate(rows):
        r['file'] = f['id']; r['locator'] = f"Sheet 'Class-wise Results', row {starts['Class-wise Results'] + i}"; r['evidence'] = a_evidence(r)
    return f


def assess_csv_file(code, rows, fname, rec_date):
    hdr = ['class', 'division', 'subject', 'skill', 'teacher', 'students_on_roll', 'students_assessed', 'students_below_40pct', 'max_marks', 'class_avg_pct', 'test_date', 'exam']
    f = add_file(code, 'assessments', fname, lambda p: save_csv(p, hdr, [[r['cls'], 'A', r['subj'], r['skill'], r['teacher_raw'], r['enrol'], r['assessed'], r['below'], r['max'], r['avg'], r['date'].isoformat(), r['exam']] for r in rows]),
                 'tabular', rec_date)
    for i, r in enumerate(rows):
        r['file'] = f['id']; r['locator'] = f'row {i + 2}'; r['evidence'] = a_evidence(r)
    return f


def assess_doc(code, rows, title):
    sc = SBY[code]
    d = Doc(title, org=sc['name'])
    d.kv([('School', sc['name']), ('Board / Medium', f"{sc['board']} / {sc['medium']}"), ('Examination', rows[0]['exam']),
          ('Benchmark', 'Below 40% of maximum marks'), ('Submitted to', f"{CRP['title']} {CRP['name']}, CRP")])
    d.table(ATABLE_HDR, [a_row(i + 1, r) for i, r in enumerate(rows)], ATABLE_W)
    return d


def assess_pdf_file(code, rows, fname, rec_date, scanned, seed, title='Class-wise Result Statement'):
    d = assess_doc(code, rows, title)
    if scanned:
        f = add_file(code, 'assessments', fname, lambda p: save_scanned(d, p, 'pdf', seed, folder(code)), 'scanned', rec_date, scanned=True)
    else:
        f = add_file(code, 'assessments', fname, lambda p: render_pdf(d, p), 'tabular', rec_date)
    for i, r in enumerate(rows):
        r['file'] = f['id']; r['locator'] = f'page {i // 14 + 1}, Sr. {i + 1}'; r['evidence'] = a_evidence(r)
    return f


NARR_A = ["In Class {cls}, {subj} ({skill}): {below} of the {assessed} students assessed scored below the 40% benchmark.",
          "For Class {cls} {subj}, the test showed that {below} out of {assessed} students who appeared were below the benchmark of 40%.",
          "{below} of the {assessed} students of Class {cls} could not reach 40% in {subj} ({skill})."]


def assess_narrative_file(code, rows, fname, rec_date):
    sc = SBY[code]; d = Doc('Note on First Unit Test Results', org=sc['name'])
    d.p(f"This note summarises the results of the {rows[0]['exam']} conducted on {long_date(rows[0]['date'])} for the information of the CRP. "
        f"Each test was marked out of {rows[0]['max']}, and students scoring below 40% are counted as below the benchmark.")
    cur = None
    for i, r in enumerate(rows):
        if r['cls'] != cur:
            cur = r['cls']; d.h(f'Class {cur}')
        s = NARR_A[i % 3].format(**r)
        n = d.p(s); r['locator'] = f'paragraph {n}'; r['evidence'] = s
    d.p('The Headmaster has asked the class teachers to plan remedial work for the students who are below the benchmark.')
    f = add_file(code, 'assessments', fname, lambda p: render_pdf(d, p), 'narrative', rec_date)
    for r in rows: r['file'] = f['id']
    return f


# ====================================================================== observation specs
def O(date, cls, subj, need, sev, status='open', act=None, src='report', teacher=None, label=None, resolved_on=None):
    return dict(date=D(date), cls=cls, subj=subj, need=need, sev=sev, status=status, act=act, src=src, teacher=teacher, label=label, resolved_on=resolved_on)


COMP = lambda d, ev: ('completed', d, ev)
SPEC = {
    'S01': dict(visits=[('2026-06-22', [(2, 'Marathi'), (3, 'Mathematics'), (5, 'English')]), ('2026-07-06', [(2, 'Marathi'), (3, 'Mathematics'), (5, 'EVS'), (6, 'English')])],
                obs=[O('2026-06-22', 2, 'Marathi', 'FLN_READING', 'critical', act=('2026-07-13', 'open')),
                     O('2026-06-22', 3, 'Mathematics', 'NUMERACY_BASIC', 'significant', act=('2026-07-20', 'open')),
                     O('2026-06-22', None, 'All subjects', 'ATTENDANCE_IRREGULAR', 'significant', act=('2026-07-31', 'open'), label='2, 3 and 4'),
                     O('2026-07-06', 2, 'Marathi', 'FLN_READING', 'critical'),
                     O('2026-07-06', 3, 'Mathematics', 'NUMERACY_BASIC', 'significant'),
                     O('2026-07-06', 5, 'EVS', 'TLM_USAGE', 'minor'),
                     O('2026-07-06', 1, 'All subjects', 'MULTIGRADE_MGMT', 'significant', label='1 and 2'),
                     O('2026-07-06', 3, 'Mathematics', 'CLASS_PARTICIPATION', 'significant', src='audio')]),
    'S03': dict(visits=[('2026-06-25', [(3, 'Mathematics'), (4, 'Marathi')]), ('2026-07-08', [(3, 'English'), (5, 'Marathi')])],
                obs=[O('2026-06-25', 3, 'Mathematics', 'LESSON_PLANNING', 'minor'),
                     O('2026-06-25', 4, 'Marathi', 'ASSESSMENT_PRACTICE', 'significant', act=('2026-07-10', 'open')),
                     O('2026-07-08', 3, 'English', 'ENGLISH_SPEAKING', 'minor', act=('2026-07-22', 'open'))]),
    'S05': dict(visits=[('2026-06-23', [(3, 'Marathi'), (6, 'Science'), (7, 'Mathematics')]), ('2026-07-03', [(3, 'Marathi')])],
                obs=[O('2026-06-23', 3, 'Marathi', 'CLASS_PARTICIPATION', 'significant', act=('2026-07-15', 'open')),
                     O('2026-06-23', 6, 'Science', 'SCIENCE_PRACTICALS', 'significant', act=('2026-07-17', 'open')),
                     O('2026-06-23', 3, 'Marathi', 'TLM_USAGE', 'minor'),
                     O('2026-07-03', 3, 'Marathi', 'CLASS_PARTICIPATION', 'significant'),
                     O('2026-07-03', 3, 'Marathi', 'TLM_USAGE', 'minor')]),
    'S09': dict(visits=[('2026-07-02', [])], obs=[]),
    'S10': dict(visits=[('2026-06-24', [(3, 'English'), (6, 'Mathematics')]), ('2026-07-07', [(6, 'English'), (5, 'English'), (2, 'Marathi')])],
                obs=[O('2026-06-24', 3, 'English', 'ENGLISH_SPEAKING', 'significant', act=('2026-07-20', 'open')),
                     O('2026-06-24', 6, 'Mathematics', 'LESSON_PLANNING', 'significant', act=('2026-07-18', 'open')),
                     O('2026-07-07', 6, 'English', 'WRITING_SKILLS', 'minor')]),
    'S02': dict(visits=[('2026-06-22', [(4, 'Mathematics'), (8, 'Mathematics'), (7, 'English'), (2, 'English')]), ('2026-07-05', [(4, 'Mathematics'), (5, 'English')]),
                        ('2026-08-27', [(4, 'Mathematics'), (8, 'Mathematics'), (7, 'Science'), (8, 'English')])],
                obs=[O('2026-06-22', 4, 'Mathematics', 'NUMERACY_BASIC', 'significant', status='in_progress',
                       act=('2026-07-31', COMP('2026-08-14', 'Place-value cards introduced from 3 August and weekly oral number drills held in Class 4.'))),
                     O('2026-06-22', 8, 'Mathematics', 'LESSON_PLANNING', 'minor'),
                     O('2026-06-22', 7, 'English', 'ENGLISH_SPEAKING', 'minor'),
                     O('2026-07-05', 4, 'Mathematics', 'CLASS_PARTICIPATION', 'significant', act=('2026-09-15', 'open')),
                     O('2026-08-27', 4, 'Mathematics', 'NUMERACY_BASIC', 'significant'),
                     O('2026-08-27', 7, 'Science', 'SCIENCE_PRACTICALS', 'minor'),
                     O('2026-08-27', 8, 'Mathematics', 'GOOD_PRACTICE', 'none', status='n/a'),
                     O('2026-08-27', 4, 'Mathematics', 'CLASS_PARTICIPATION', 'significant', src='audio', act=('2026-11-10', 'open'))]),
    'S04': dict(visits=[('2026-06-26', [(5, 'Mathematics'), (7, 'Science'), (8, 'Mathematics')]), ('2026-09-02', [(5, 'English'), (9, 'Mathematics'), (6, 'Marathi'), (7, 'English')])],
                obs=[O('2026-06-26', 5, 'Mathematics', 'LESSON_PLANNING', 'minor', status='resolved', resolved_on='2026-09-02',
                       act=('2026-08-10', COMP('2026-08-18', 'Weekly lesson plans prepared for all Class 4 and 5 subjects and countersigned by the Headmaster; seen during the 2 September visit.'))),
                     O('2026-06-26', 7, 'Science', 'GOOD_PRACTICE', 'none', status='n/a'),
                     O('2026-09-02', 5, 'English', 'GOOD_PRACTICE', 'none', status='n/a'),
                     O('2026-09-02', 9, 'Mathematics', 'TLM_USAGE', 'minor', act=('2026-11-15', 'open'))]),
    'S06': dict(visits=[('2026-06-24', [(7, 'Science'), (8, 'Mathematics')]), ('2026-08-25', [(7, 'Science'), (9, 'English'), (8, 'Marathi'), (9, 'Mathematics')])],
                obs=[O('2026-06-24', 7, 'Science', 'SCIENCE_PRACTICALS', 'significant', act=('2026-07-25', 'open')),
                     O('2026-06-24', 8, 'Mathematics', 'ASSESSMENT_PRACTICE', 'minor'),
                     O('2026-08-25', 7, 'Science', 'SCIENCE_PRACTICALS', 'significant', act=('2026-09-30', 'open')),
                     O('2026-08-25', 9, 'English', 'WRITING_SKILLS', 'minor', act=('2026-10-15', 'open'))]),
    'S07': dict(visits=[('2026-06-27', [(6, 'Science'), (5, 'Mathematics')]), ('2026-09-01', [(8, 'English'), (5, 'Mathematics'), (9, 'Mathematics'), (7, 'Science')])],
                obs=[O('2026-06-27', 6, 'Science', 'SCIENCE_PRACTICALS', 'significant', src='audio', act=('2026-07-31', 'open')),
                     O('2026-06-27', 5, 'Mathematics', 'ASSESSMENT_PRACTICE', 'significant', act=('2026-07-20', 'open')),
                     O('2026-09-01', 8, 'English', 'WRITING_SKILLS', 'significant', act=('2026-09-12', 'open')),
                     O('2026-09-01', 5, 'Mathematics', 'ASSESSMENT_PRACTICE', 'significant', act=('2026-10-12', 'open')),
                     O('2026-09-01', 5, 'Mathematics', 'TLM_USAGE', 'minor', act=('2026-10-20', 'open'))]),
    'S08': dict(visits=[('2026-06-28', [(3, 'Marathi'), (6, 'Mathematics')]), ('2026-09-01', [(3, 'English'), (3, 'Marathi'), (5, 'Mathematics'), (7, 'Science')])],
                obs=[O('2026-06-28', 3, 'Marathi', 'FLN_READING', 'significant', status='in_progress',
                       act=('2026-08-25', COMP('2026-08-25', 'Daily 30-minute guided reading groups running since 7 July; reading corner set up and reading-level chart maintained. Verified during the 1 September visit.'))),
                     O('2026-06-28', 6, 'Mathematics', 'NUMERACY_BASIC', 'significant', act=('2026-10-20', 'open')),
                     O('2026-09-01', 3, 'Marathi', 'FLN_READING', 'minor', status='in_progress'),
                     O('2026-09-01', 3, 'English', 'GOOD_PRACTICE', 'none', status='n/a', src='audio')]),
}
AUDIO_TAGS = {('S01', 'CLASS_PARTICIPATION'): ['norule', 'dontask', 'nounderstand'], ('S02', 'CLASS_PARTICIPATION'): ['noq', 'studentq', 'deflect'],
              ('S07', 'SCIENCE_PRACTICALS'): ['canwesee', 'noexp', 'kitask', 'kitlocked'], ('S08', 'GOOD_PRACTICE'): ['pairrule', 'progress', 'readingcorner']}


def cl_label(o):
    if o['label']: return f"Classes {o['label']}"
    return f"Class {o['cls']}"


def build_records(code):
    sp = SPEC[code]; sc = SBY[code]
    for date, lessons in sp['visits']:
        d = D(date)
        VISITS.append(dict(id=uid('visit', code, date, 'school'), school=code, teacher=None, date=d, type='school_visit', cls=None, subj=None, file=None))
        for cls, subj in lessons:
            t = teacher_for(code, cls, subj); assert t, (code, cls, subj)
            VISITS.append(dict(id=uid('visit', code, date, t['code'], cls, subj), school=code, teacher=t, date=d, type='classroom_observation', cls=cls, subj=subj, file=None))
    for k, o in enumerate(sp['obs']):
        t = o['teacher'] or (teacher_for(code, o['cls'], o['subj']) if o['subj'] not in ('All subjects',) else teacher_for(code, o['cls'], 'Marathi'))
        if o['need'] == 'ATTENDANCE_IRREGULAR': t = None
        rec = dict(id=uid('obs', code, o['date'].isoformat(), o['need'], o['cls'], o['subj'], k), school=code, teacher=t, date=o['date'], need=o['need'], sev=o['sev'], status=o['status'],
                   cls_label=cl_label(o), cls=o['cls'], subj=o['subj'], src=o['src'], resolved_on=o['resolved_on'], act=o['act'], file=None, locator=None, evidence=None,
                   vstatus='valid', dup_of=None)
        tpls = TPL[o['need']]; tn = tname(t) if t else f"the Headmaster"
        sub = o['subj'] if o['subj'] != 'All subjects' else 'class'
        rec['core'] = tpls[int(rec['id'][:4], 16) % len(tpls)].format(t=tn, cl=rec['cls_label'], subj=sub)
        rec['sevtxt'] = SEV[o['sev']][int(rec['id'][4:8], 16) % 2] if o['sev'] in SEV else ''
        rec['para'] = (rec['core'] + ' ' + rec['sevtxt']).strip()
        rec['resp'] = tname(t) if t else f"{tname(tlist(code)[0])}"
        if o['act']:
            due, outcome = o['act']
            rec['action'] = ACTION[o['need']]
            rec['due'] = D(due); rec['outcome'] = outcome
        OBS.append(rec)


def obs_for(code, date): return [o for o in OBS if o['school'] == code and o['date'] == D(date) and o['src'] == 'report']


def visit_doc(code, date, style, title=None, extra_followups=None):
    """Return (Doc, assigns) for the visit report of one visit; fills locators on the observation/intervention records."""
    sc = SBY[code]; d = D(date); obs = obs_for(code, date)
    lessons = [v for v in VISITS if v['school'] == code and v['date'] == d and v['type'] == 'classroom_observation']
    ltxt = ', '.join(f"Class {v['cls']} {v['subj']}" for v in lessons) or 'no classroom lessons'
    met = ', '.join(dict.fromkeys(tname(v['teacher']) for v in lessons)) or '-'
    doc = Doc(title or f"Visit Report - {sc['name']}", org=CRP['office'])
    doc.kv([('School', sc['name']), ('Board / Medium', f"{sc['board']} / {sc['medium']}"), ('Date of visit', long_date(d)),
            ('Visited by', f"{CRP['title']} {CRP['name']}, Cluster Resource Person, {CRP['cluster']}"), ('Lessons observed', ltxt), ('Teachers met', met)])
    doc.h('Summary of the visit')
    doc.p(INTRO[int(uid('intro', code, date)[:4], 16) % 3].format(school=sc['name'], date=long_date(d), n=len(lessons), lessons=ltxt))
    doc.h('Observations')
    if style == 'form':
        rows = []
        for i, o in enumerate(obs, 1):
            t = o['teacher']
            rows.append([i, tname(t) if t else 'School level', o['cls_label'].replace('Class ', '').replace('Classes ', ''), o['subj'], o['core'], SMALL[o['sev']]])
            o['file_loc'] = f'table 1, row {i}'; o['evidence'] = o['core'] + f" [Concern level: {SMALL[o['sev']]}]"
        doc.table(['Sr.', 'Teacher', 'Class', 'Subject', 'Observation', 'Concern level'], rows, [8, 30, 12, 22, 78, 20])
    else:
        for o in obs:
            n = doc.bullet(o['para']) if style == 'bullets' else doc.p(o['para'])
            o['file_loc'] = f'paragraph {n}'; o['evidence'] = o['para']
    acts = [o for o in obs if o.get('act')]
    if acts:
        doc.h('Agreed actions and follow-up')
        if style == 'form':
            rows = []
            for i, o in enumerate(acts, 1):
                rows.append([i, o['action'], o['resp'], dmy(o['due'])]); o['act_loc'] = f'table 2, row {i}'
            doc.table(['Sr.', 'Agreed action', 'Responsible', 'To be completed by'], rows, [8, 100, 36, 26])
        else:
            for o in acts:
                s = f"Agreed action: {o['action']}. Responsible: {o['resp']}. To be completed by {long_date(o['due'])}."
                n = doc.bullet(s) if style == 'bullets' else doc.p(s); o['act_loc'] = f'paragraph {n}'
    if extra_followups:
        extra_followups(doc)
    doc.h('Next steps')
    doc.p('I thank the Headmaster and the staff for their cooperation. I will review the progress of the agreed actions during my next visit to the school.')
    return doc, obs


def finish_visit_file(f, obs, code, date):
    for o in obs:
        o['file'] = f['id']; o['locator'] = o.pop('file_loc')
    for v in VISITS:
        if v['school'] == code and v['date'] == D(date): v['file'] = f['id']


def write_report(code, date, style, fmt, fname, **kw):
    doc, obs = visit_doc(code, date, style, kw.get('title'), kw.get('extra'))
    sc_seed = int(uid('scan', code, date)[:6], 16)
    if fmt == 'docx': f = add_file(code, 'observations', fname, lambda p: render_docx(doc, p), 'form' if style == 'form' else 'narrative', D(date))
    elif fmt == 'pdf': f = add_file(code, 'observations', fname, lambda p: render_pdf(doc, p), 'form' if style == 'form' else 'narrative', D(date))
    elif fmt == 'md': f = add_file(code, 'observations', fname, lambda p: render_md(doc, p), 'narrative', D(date))
    elif fmt == 'txt': f = add_file(code, 'observations', fname, lambda p: render_txt(doc, p), 'narrative', D(date))
    elif fmt == 'scan_pdf': f = add_file(code, 'observations', fname, lambda p: save_scanned(doc, p, 'pdf', sc_seed, folder(code)), 'scanned', D(date), scanned=True)
    finish_visit_file(f, obs, code, date)
    return f, doc, obs


def write_handwritten(code, date, fname):
    sc = SBY[code]; d = D(date); obs = obs_for(code, date)
    lines, k = [], 0
    for o in obs:
        k += 1; lines.append(f'{k}. ' + o['para']); o['file_loc'] = f'note item {k}'; o['evidence'] = o['para']
    acts = [o for o in obs if o.get('act')]
    if acts: lines.append('Agreed actions:')
    for o in acts:
        k += 1; lines.append(f"{k}. {o['action']}. Responsible: {o['resp']}. By {dmy(o['due'])}."); o['act_loc'] = f'note item {k}'
    f = add_file(code, 'observations', fname, lambda p: save_handwritten(f"Field note - {sc['name']} - {dmy(d)}", lines, p, int(uid('hw', code, date)[:6], 16)),
                 'handwritten', d, scanned=True, notes='Handwritten-style English field note, scanned')
    finish_visit_file(f, obs, code, date)
    return f


def attach_actions(code):
    """Create interventions and follow-ups from observations that carry agreed actions."""
    for o in [x for x in OBS if x['school'] == code and x.get('act')]:
        iid = uid('intervention', o['id'])
        INTV.append(dict(id=iid, school=code, teacher=o['teacher'], obs=o['id'], created=o['date'], recommended=o['action'], approved=o['action'], resp=o['resp'], planned=o['due'],
                         status='completed' if o['outcome'] != 'open' else 'approved', file=o['file'], locator=o.get('act_loc') or o['locator']))
        fu = dict(id=uid('followup', o['id']), intv=iid, school=code, teacher=o['teacher'], due=o['due'], status='open', completed=None, evidence=None, cfile=None, cloc=None)
        if o['outcome'] != 'open':
            fu.update(status='completed', completed=D(o['outcome'][1]), evidence=o['outcome'][2])
        o['fu'] = fu; FUP.append(fu)


# ====================================================================== main
def main():
    for p in (DATA, SEED, EVAL):
        if p.exists(): shutil.rmtree(p)
        p.mkdir(parents=True)
    for s in SCHOOLS:
        (folder(s['code'])).mkdir(parents=True, exist_ok=True)
    for code in SPEC: build_records(code)

    # ---- audio first (observations reference timestamps)
    for code, sp in SCRIPTS.items():
        lessons = [v for v in VISITS if v['school'] == code and v['date'] == D(sp['date']) and v['cls'] == sp['cls'] and v['subj'] == sp['subj']]
        t = lessons[0]['teacher']; female = t['title'] != 'Mr.'
        print('audio', code, flush=True)
        holder = {}

        def w(p, sp=sp, female=female, holder=holder):
            holder['dur'], holder['segs'] = build_audio(sp['script'], female, p)
        f = add_file(code, 'audio', sp['file'], w, 'audio', D(sp['date']), teacher=t['id'], duration=holder.get('dur'), notes='Synthetic classroom recording (TTS), English')
        f['duration'] = holder['dur']
        AUDIO_META[code] = dict(file=f, segs=holder['segs'], teacher=t)
        for o in OBS:
            if o['school'] == code and o['src'] == 'audio':
                segs = [s for s in holder['segs'] if s['tag'] in AUDIO_TAGS[(code, o['need'])]]
                o['file'] = f['id']; o['locator'] = f"audio {mmss(min(s['start'] for s in segs))}-{mmss(max(s['end'] for s in segs))}"
                o['evidence'] = ' / '.join(s['text'] for s in segs); o['para'] = o['core']
                for v in VISITS:
                    if v['school'] == code and v['date'] == o['date'] and v['teacher'] and v['teacher']['id'] == t['id'] and v['cls'] == sp['cls']: v['file'] = f['id']
                o['act_loc'] = None
    # ---- assessments
    for code in ASSESS_CLASSES:
        pass
    A = {}
    for code, ws in GAP.items():
        for w in ws: A[(code, w)] = make_assess(code, w)
    # S01 scanned PDF marks sheet
    assess_pdf_file('S01', A[('S01', 'W1')], '2026-06-30_first_unit_test_marks_scan.pdf', D('2026-06-30'), True, 11, 'Class-wise Result Statement - First Unit Test')
    assess_xlsx_file('S02', A[('S02', 'W1')], '2026-06-30_first_unit_test_results.xlsx', D('2026-06-30'))
    assess_xlsx_file('S02', A[('S02', 'W2')], '2026-09-03_first_term_exam_results.xlsx', D('2026-09-03'))
    assess_xlsx_file('S03', A[('S03', 'W1')], '2026-06-30_unit_test_results.xlsx', D('2026-06-30'))
    assess_csv_file('S04', A[('S04', 'W1')], '2026-07-01_unit_test_results.csv', D('2026-07-01'))
    assess_csv_file('S04', A[('S04', 'W2')], '2026-09-02_term_exam_results.csv', D('2026-09-02'))
    assess_narrative_file('S06', A[('S06', 'W1')], '2026-07-02_unit_test_results_note.pdf', D('2026-07-02'))
    assess_pdf_file('S06', A[('S06', 'W2')], '2026-09-02_term_exam_results_statement.pdf', D('2026-09-02'), False, 0)
    # S07: xlsx + conflicting pdf summary
    s07 = A[('S07', 'W1')]
    assess_xlsx_file('S07', s07, '2026-06-30_unit_test_results.xlsx', D('2026-06-30'))
    pdf_rows = []
    for key in [(5, 'Mathematics'), (5, 'English'), (8, 'Science')]:
        src = next(r for r in s07 if (r['cls'], r['subj']) == key)
        r = dict(src); r['id'] = uid('assessment', 'S07', 'W1', key, 'pdf'); pdf_rows.append(r)
    pdf_rows[0].update(below=27, avg=61);
    for r in pdf_rows: r['evidence'] = None
    f_conf = assess_pdf_file('S07', pdf_rows, '2026-07-03_result_summary_for_crp.pdf', D('2026-07-03'), False, 0, 'Result Summary for CRP - First Unit Test')
    src_math = next(r for r in s07 if (r['cls'], r['subj']) == (5, 'Mathematics'))
    pdf_rows[0].update(status='conflict', note='Class 5 Mathematics: students below benchmark is 27 in the PDF summary but 18 in the Excel result sheet'); src_math.update(status='conflict', note=pdf_rows[0]['note'])
    for r, key in zip(pdf_rows[1:], [(5, 'English'), (8, 'Science')]):
        orig = next(x for x in s07 if (x['cls'], x['subj']) == key); r.update(status='duplicate', dup_of=orig['id'], note='Same figures already present in the Excel result sheet')
    A[('S07', 'W1')] = s07 + pdf_rows
    assess_xlsx_file('S07', A[('S07', 'W2')], '2026-09-03_first_term_exam_results.xlsx', D('2026-09-03'))
    assess_xlsx_file('S08', A[('S08', 'W1')], '2026-07-01_unit_test_results.xlsx', D('2026-07-01'))
    assess_pdf_file('S08', A[('S08', 'W2')], '2026-09-04_first_term_results_scan.pdf', D('2026-09-04'), True, 21, 'Class-wise Result Statement - First Term Examination')
    # S10: invalid rows planted
    s10 = A[('S10', 'W1')]
    for r in s10:
        k = (r['cls'], r['subj'])
        if k == (6, 'Science'): r.update(assessed=52, below=61, status='invalid', note='students_below (61) exceeds students_assessed (52)')
        elif k == (9, 'Mathematics'): r.update(assessed=0, below=0, avg=0, status='invalid', note='students_assessed is zero; percentage undefined')
        elif k == (9, 'Social Science'): r.update(date=D('2027-03-14'), status='invalid', note='test date is in the future')
        elif k == (6, 'Hindi'): r.update(teacher=None, teacher_raw='Mr. Kulkarni', status='needs_review', note='teacher "Mr. Kulkarni" not found in the school roster')
    assess_xlsx_file('S10', s10, '2026-07-02_unit_test_results.xlsx', D('2026-07-02'), ['Marks for Class 9 Mathematics to be updated after re-test.'])
    for rows in A.values():
        ASSESS.extend(rows)

    # ---- observation documents
    write_handwritten('S01', '2026-06-22', '2026-06-22_field_note_scan.jpg')
    write_report('S01', '2026-07-06', 'narrative', 'docx', '2026-07-06_visit_report.docx')
    write_report('S03', '2026-06-25', 'narrative', 'pdf', '2026-06-25_visit_report.pdf')
    write_report('S03', '2026-07-08', 'form', 'pdf', '2026-07-08_followup_visit_form.pdf')
    write_report('S05', '2026-06-23', 'bullets', 'txt', '2026-06-23_visit_notes.txt')
    write_report('S05', '2026-07-03', 'bullets', 'txt', '2026-07-03_visit_notes.txt')
    write_report('S10', '2026-06-24', 'narrative', 'docx', '2026-06-24_visit_report.docx')
    write_report('S10', '2026-07-07', 'narrative', 'docx', '2026-07-07_visit_report.docx')
    write_report('S02', '2026-06-22', 'form', 'pdf', '2026-06-22_classroom_observation_form.pdf')
    write_report('S02', '2026-07-05', 'form', 'pdf', '2026-07-05_classroom_observation_form.pdf')
    write_report('S02', '2026-08-27', 'narrative', 'pdf', '2026-08-27_visit_report.pdf')
    write_report('S04', '2026-06-26', 'bullets', 'md', '2026-06-26_visit_notes.md')

    def s04_followup(doc):
        doc.h('Follow-up of earlier actions')
        fu = next(o['outcome'] for o in OBS if o['school'] == 'S04' and o.get('act') and o['outcome'] != 'open')
        n = doc.bullet(f"Lesson-plan action due 10 August 2026: completed on 18 August 2026. {fu[2]}")
        S04_FU['loc'] = f'paragraph {n}'
    S04_FU = {}
    f4, _, _ = write_report('S04', '2026-09-02', 'bullets', 'md', '2026-09-02_visit_notes.md', extra=s04_followup)
    S04_FU['file'] = f4['id']
    write_report('S06', '2026-06-24', 'narrative', 'pdf', '2026-06-24_visit_report.pdf')
    f6, doc6, obs6 = write_report('S06', '2026-08-25', 'narrative', 'docx', '2026-08-26_visit_report_classes_7_to_9.docx')
    # exact duplicate (same bytes), and a near-duplicate re-submitted PDF
    f6b = add_file('S06', 'observations', '2026-08-26_visit_report_classes_7_to_9 (1).docx', lambda p: shutil.copyfile(folder('S06') / 'observations' / f6['filename'], p), 'narrative',
                   D('2026-08-26'), dup_of=f6['id'], status='duplicate_exact', notes='Exact duplicate upload (identical bytes)', minute=7)
    d6c = Doc('Visit Report - Shri Ganesh Vidyalaya, Ambegaon (re-submitted copy)', org=CRP['office'])
    d6c.blocks = list(doc6.blocks); d6c.blocks.append(('p', 'Note: this copy was re-submitted at the request of the Block Education Office.'))
    f6c = add_file('S06', 'observations', '2026-08-28_visit_report_resubmitted.pdf', lambda p: render_pdf(d6c, p), 'narrative', D('2026-08-28'), dup_of=f6['id'],
                   status='possible_duplicate', notes='Near-duplicate: same content re-exported as PDF with an added note')
    for o in list(obs6):
        for ff, tag in ((f6b, 'exact'), (f6c, 'near')):
            c = dict(o); c['id'] = uid('obs', o['id'], tag); c['file'] = ff['id']; c['dup_of'] = o['id']; c['vstatus'] = 'duplicate'; c.pop('fu', None); c['act'] = None
            OBS.append(c)
    write_report('S07', '2026-06-27', 'bullets', 'txt', '2026-06-27_visit_notes.txt')
    write_report('S07', '2026-09-01', 'bullets', 'txt', '2026-09-01_visit_notes.txt')
    write_handwritten('S08', '2026-06-28', '2026-06-28_field_note_scan.jpg')
    write_report('S08', '2026-09-01', 'narrative', 'scan_pdf', '2026-09-01_visit_report_scan.pdf')

    # S05 visit log CSV
    vrows = []
    for v in sorted([x for x in VISITS if x['school'] == 'S05'], key=lambda x: (x['date'], x['type'])):
        vrows.append([v['date'].isoformat(), SBY['S05']['name'], tname(v['teacher']) if v['teacher'] else '-', v['cls'] or '', v['subj'] or '',
                      'Classroom observation' if v['teacher'] else 'School visit', 'Notes filed separately' if v['teacher'] else 'Routine cluster visit'])
    fl = add_file('S05', 'visits', '2026-07-03_crp_visit_log.csv', lambda p: save_csv(p, ['date', 'school', 'teacher', 'class', 'subject', 'visit_type', 'remarks'], vrows), 'tabular', D('2026-07-03'))
    for v in VISITS:
        if v['school'] == 'S05': v['file'] = fl['id']
    # S09 onboarding note + roster
    note = Doc('Onboarding Visit Note - Sant Dnyaneshwar English School, Karanje', org=CRP['office'])
    note.p('Visited the school on 2 July 2026 for registration and introduction. The school started this academic year with Classes 1 to 5 and three teachers. '
           'No classroom observation or assessment has been done yet. A first academic visit will be planned.')
    fn = add_file('S09', 'visits', '2026-07-02_onboarding_visit_note.md', lambda p: render_md(note, p), 'narrative', D('2026-07-02'))
    for v in VISITS:
        if v['school'] == 'S09': v['file'] = fn['id']
    rost = [[i + 1, tname(t), t['qualification'], dmy(t['joined']), ', '.join(map(str, t['classes'])), ', '.join(t['subjects'])] for i, t in enumerate(tlist('S09'))]
    add_file('S09', 'roster', '2026-07-02_teacher_roster.xlsx', lambda p: save_xlsx(p, [dict(name='Teachers', meta=[('School', SBY['S09']['name'])], header=['Sr.', 'Teacher', 'Qualification', 'Joined', 'Classes', 'Subjects'], rows=rost, widths=[6, 28, 18, 14, 14, 50])]),
             'tabular', D('2026-07-02'))
    # remaining visit file mappings = report files already set

    # ---- action records
    for code in SPEC: attach_actions(code)
    # follow-up trackers / registers
    s02 = [o for o in OBS if o['school'] == 'S02' and o.get('fu')]
    rows = []
    for i, o in enumerate(sorted(s02, key=lambda x: x['due']), 1):
        done = o['outcome'] != 'open'
        rows.append([f'FU-{i}', o['action'], o['resp'], dmy(o['date']), dmy(o['due']), 'Completed' if done else 'Pending', dmy(D(o['outcome'][1])) if done else '', o['outcome'][2] if done else ''])
    st = {}
    ft = add_file('S02', 'followups', '2026-08-28_followup_tracker.xlsx', lambda p: st.update(save_xlsx(p, [dict(name='Follow-up tracker', meta=[('School', SBY['S02']['name']), ('Updated on', '28/08/2026')],
                  header=['Action ID', 'Action agreed', 'Responsible', 'Agreed on', 'Due date', 'Status', 'Completed on', 'Remarks'], rows=rows, widths=[10, 60, 24, 12, 12, 12, 14, 60])])), 'tabular', D('2026-08-28'))
    for i, o in enumerate(sorted(s02, key=lambda x: x['due'])):
        if o['outcome'] != 'open': o['fu'].update(cfile=ft['id'], cloc=f"Sheet 'Follow-up tracker', row {st['Follow-up tracker'] + i}")
    s08 = [o for o in OBS if o['school'] == 'S08' and o.get('fu')]
    rows = []
    for i, o in enumerate(sorted(s08, key=lambda x: x['due']), 1):
        done = o['outcome'] != 'open'
        rows.append([f'INT-{i}', o['need'].replace('_', ' ').title(), o['action'], o['resp'], dmy(o['date']), dmy(o['due']), 'Completed' if done else 'Planned', dmy(D(o['outcome'][1])) if done else '', o['outcome'][2] if done else ''])
    fi = add_file('S08', 'followups', '2026-09-03_interventions_register.csv', lambda p: save_csv(p, ['id', 'issue', 'action', 'responsible', 'start_date', 'due_date', 'status', 'completed_on', 'remarks'], rows), 'tabular', D('2026-09-03'))
    for i, o in enumerate(sorted(s08, key=lambda x: x['due'])):
        if o['outcome'] != 'open': o['fu'].update(cfile=fi['id'], cloc=f'row {i + 2}')
    for o in OBS:
        if o['school'] == 'S04' and o.get('fu') and o['outcome'] != 'open':
            o['fu'].update(cfile=S04_FU['file'], cloc=S04_FU['loc'])

    # ---- attendance
    def att(code, fname, fmt, months, rd):
        rows = [[m, wd, pct, 90] for m, wd, pct in months]
        if fmt == 'xlsx':
            st = {}
            f = add_file(code, 'attendance', fname, lambda p: st.update(save_xlsx(p, [dict(name='Attendance', meta=[('School', SBY[code]['name']), ('Target attendance', '90%')], header=['Month', 'Working days', 'Average daily attendance %', 'Target %'], rows=rows, widths=[12, 14, 26, 10])])), 'tabular', rd)
            base = st['Attendance']; loc = lambda i: f"Sheet 'Attendance', row {base + i}"
        else:
            f = add_file(code, 'attendance', fname, lambda p: save_csv(p, ['month', 'working_days', 'avg_daily_attendance_pct', 'target_pct'], rows), 'tabular', rd)
            loc = lambda i: f'row {i + 2}'
        for i, (m, wd, pct) in enumerate(months):
            ATT.append(dict(id=uid('attendance', code, m), school=code, month=m, days=wd, pct=pct, target=90, file=f['id'], locator=loc(i)))
    att('S01', '2026-07-08_attendance_summary.xlsx', 'xlsx', [('2026-06', 21, 62.0), ('2026-07', 8, 58.4)], D('2026-07-08'))
    att('S02', '2026-09-03_attendance_summary.xlsx', 'xlsx', [('2026-06', 22, 91.4), ('2026-07', 24, 89.8), ('2026-08', 23, 88.2)], D('2026-09-03'))
    att('S04', '2026-09-02_attendance_summary.csv', 'csv', [('2026-06', 22, 95.1), ('2026-07', 24, 96.0), ('2026-08', 23, 94.6)], D('2026-09-02'))
    att('S10', '2026-07-07_attendance_summary.csv', 'csv', [('2026-06', 21, 82.3), ('2026-07', 7, 80.1)], D('2026-07-07'))
    write_outputs()


def b(x): return 'true' if x is True else 'false' if x is False else ('' if x is None else x)


def wcsv(name, cols, rows):
    with open(SEED / name, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(cols)
        for r in rows: w.writerow([b(r.get(c)) for c in cols])


def write_outputs():
    sid = lambda c: SBY[c]['id'] if c else None
    crp_id = uid('crp', CRP['code'])
    wcsv('crps.csv', ['id', 'code', 'full_name', 'cluster', 'block', 'district', 'is_demo'],
         [dict(id=crp_id, code=CRP['code'], full_name=f"{CRP['title']} {CRP['name']}", cluster=CRP['cluster'], block=CRP['block'], district=CRP['district'], is_demo=True)])
    wcsv('schools.csv', ['id', 'code', 'name', 'school_type', 'board', 'medium', 'grade_from', 'grade_to', 'village', 'taluka', 'district', 'udise_code', 'cluster', 'is_demo'],
         [dict(id=s['id'], code=s['code'], name=s['name'], school_type=s['stype'], board=s['board'], medium=s['medium'], grade_from=s['g'][0], grade_to=s['g'][1], village=s['village'],
               taluka=s['taluka'], district='Pune', udise_code=s['udise'], cluster=CRP['cluster'], is_demo=True) for s in SCHOOLS])
    wcsv('school_assignments.csv', ['id', 'crp_id', 'school_id', 'assigned_on', 'is_demo'],
         [dict(id=uid('assign', s['code']), crp_id=crp_id, school_id=s['id'], assigned_on='2026-04-01', is_demo=True) for s in SCHOOLS])
    wcsv('teachers.csv', ['id', 'school_id', 'teacher_code', 'full_name', 'title', 'designation', 'qualification', 'joined_date', 'classes_taught', 'subjects_taught', 'is_demo'],
         [dict(id=t['id'], school_id=sid(t['school']), teacher_code=t['code'], full_name=t['name'], title=t['title'], designation=t['designation'], qualification=t['qualification'],
               joined_date=t['joined'].isoformat(), classes_taught=';'.join(map(str, t['classes'])), subjects_taught=';'.join(t['subjects']), is_demo=True) for t in TEACHERS])
    wcsv('source_files.csv', ['id', 'school_id', 'teacher_id', 'section', 'original_filename', 'storage_path', 'mime_type', 'file_format', 'size_bytes', 'sha256', 'doc_kind', 'is_scanned',
                              'language', 'record_date', 'uploaded_at', 'uploaded_by_crp_id', 'duration_seconds', 'processing_status', 'duplicate_of_file_id', 'notes', 'is_demo'],
         [dict(id=f['id'], school_id=sid(f['school']), teacher_id=f['teacher'], section=f['section'], original_filename=f['filename'], storage_path=f['path'], mime_type=f['mime'],
               file_format=f['fmt'], size_bytes=f['size'], sha256=f['sha'], doc_kind=f['kind'], is_scanned=f['scanned'], language='en', record_date=f['record_date'].isoformat(),
               uploaded_at=f['uploaded_at'], uploaded_by_crp_id=crp_id, duration_seconds=f['duration'], processing_status=f['status'], duplicate_of_file_id=f['dup_of'], notes=f['notes'], is_demo=True) for f in FILES])
    wcsv('visits.csv', ['id', 'school_id', 'teacher_id', 'crp_id', 'visit_date', 'visit_type', 'class_no', 'subject', 'source_file_id', 'is_demo'],
         [dict(id=v['id'], school_id=sid(v['school']), teacher_id=v['teacher']['id'] if v['teacher'] else None, crp_id=crp_id, visit_date=v['date'].isoformat(), visit_type=v['type'],
               class_no=v['cls'], subject=v['subj'], source_file_id=v['file'], is_demo=True) for v in VISITS])
    vid = {}
    for v in VISITS:
        vid[(v['school'], v['date'], v['teacher']['id'] if v['teacher'] else None)] = v['id']
    wcsv('assessments.csv', ['id', 'school_id', 'teacher_id', 'teacher_name_raw', 'class_no', 'division', 'subject', 'skill', 'exam_type', 'assessment_date', 'max_marks', 'benchmark_pct',
                             'students_on_roll', 'students_assessed', 'students_below', 'class_avg_pct', 'source_file_id', 'locator', 'evidence_text', 'validation_status', 'validation_note',
                             'is_duplicate_of', 'is_demo'],
         [dict(id=r['id'], school_id=sid(r['school']), teacher_id=r['teacher']['id'] if r['teacher'] else None, teacher_name_raw=r['teacher_raw'], class_no=r['cls'], division='A',
               subject=r['subj'], skill=r['skill'], exam_type=r['exam'], assessment_date=r['date'].isoformat(), max_marks=r['max'], benchmark_pct=40, students_on_roll=r['enrol'],
               students_assessed=r['assessed'], students_below=r['below'], class_avg_pct=r['avg'], source_file_id=r['file'], locator=r['locator'], evidence_text=r['evidence'],
               validation_status=r['status'], validation_note=r['note'], is_duplicate_of=r['dup_of'], is_demo=True) for r in ASSESS])
    wcsv('observations.csv', ['id', 'school_id', 'teacher_id', 'visit_id', 'observation_date', 'need_code', 'issue_text', 'severity', 'status', 'resolved_on', 'class_label', 'subject',
                              'extraction_origin', 'source_file_id', 'locator', 'evidence_text', 'validation_status', 'is_duplicate_of', 'is_demo'],
         [dict(id=o['id'], school_id=sid(o['school']), teacher_id=o['teacher']['id'] if o['teacher'] else None,
               visit_id=vid.get((o['school'], o['date'], o['teacher']['id'] if o['teacher'] else None)) or vid.get((o['school'], o['date'], None)), observation_date=o['date'].isoformat(),
               need_code=o['need'], issue_text=o['para'] if o['src'] == 'report' else o['core'], severity=o['sev'], status=o['status'], resolved_on=o['resolved_on'], class_label=o['cls_label'],
               subject=o['subj'], extraction_origin='audio_transcript' if o['src'] == 'audio' else 'document', source_file_id=o['file'], locator=o['locator'], evidence_text=o['evidence'],
               validation_status=o['vstatus'], is_duplicate_of=o['dup_of'], is_demo=True) for o in OBS])
    wcsv('interventions.csv', ['id', 'school_id', 'teacher_id', 'observation_id', 'created_on', 'recommended_action', 'approved_action', 'responsible', 'planned_completion', 'status',
                               'source_file_id', 'locator', 'is_demo'],
         [dict(id=i['id'], school_id=sid(i['school']), teacher_id=i['teacher']['id'] if i['teacher'] else None, observation_id=i['obs'], created_on=i['created'].isoformat(),
               recommended_action=i['recommended'], approved_action=i['approved'], responsible=i['resp'], planned_completion=i['planned'].isoformat(), status=i['status'],
               source_file_id=i['file'], locator=i['locator'], is_demo=True) for i in INTV])
    wcsv('follow_ups.csv', ['id', 'intervention_id', 'school_id', 'teacher_id', 'due_date', 'status', 'completed_date', 'completion_evidence', 'completion_source_file_id', 'completion_locator', 'is_demo'],
         [dict(id=f['id'], intervention_id=f['intv'], school_id=sid(f['school']), teacher_id=f['teacher']['id'] if f['teacher'] else None, due_date=f['due'].isoformat(), status=f['status'],
               completed_date=f['completed'].isoformat() if f['completed'] else None, completion_evidence=f['evidence'], completion_source_file_id=f['cfile'], completion_locator=f['cloc'], is_demo=True) for f in FUP])
    wcsv('attendance.csv', ['id', 'school_id', 'month', 'working_days', 'avg_attendance_pct', 'target_pct', 'source_file_id', 'locator', 'is_demo'],
         [dict(id=a['id'], school_id=sid(a['school']), month=a['month'], working_days=a['days'], avg_attendance_pct=a['pct'], target_pct=a['target'], source_file_id=a['file'], locator=a['locator'], is_demo=True) for a in ATT])

    # ---- ground truth (never read by the app)
    from collections import Counter
    cnt = Counter(v['teacher']['id'] for v in VISITS if v['teacher'])
    with open(EVAL / 'teacher_visit_patterns.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(['teacher_code', 'name', 'school', 'classroom_observations', 'pattern', 'joined_date'])
        for t in TEACHERS:
            n = cnt.get(t['id'], 0); w.writerow([t['code'], tname(t), t['school'], n, 'never' if n == 0 else 'once' if n == 1 else 'multiple', t['joined']])
    scen = {'S01': 'Critical: high learning gap, critical recurring issues, long-overdue follow-ups, no visit for ~110 days', 'S02': 'High learning gap persists across both windows; recently visited; mixed follow-up tiers; attendance below target',
            'S03': 'Low learning gap but follow-ups ~100 days overdue and no visit for ~110 days: deadline alert case', 'S04': 'Healthy: low gap, issues resolved, follow-up completed, attendance above target',
            'S05': 'No assessment data: provisional score only; recurring needs across two visits', 'S06': 'Duplicate uploads (exact + near) must not inflate recurring need; science practicals recurring',
            'S07': 'Conflicting Class 5 Maths figures (Excel vs PDF); overdue follow-ups across 7/15/45/88/99-day tiers', 'S08': 'Improved: Class 3 Marathi reading gap 40% -> 20%; completed intervention; one planned action 7 days overdue',
            'S09': 'New school, no assessments/observations, all teachers never visited: insufficient evidence', 'S10': 'Invalid/needs-review assessment rows planted; moderate gap'}
    json.dump(dict(generated_on=ANCHOR.isoformat(), windows=dict(W1='2026-06-20..2026-07-10', W2='2026-08-20..2026-09-05'), scenarios=scen,
                   cohorts={s['code']: s['cohort'] for s in SCHOOLS}), open(EVAL / 'scenarios.json', 'w'), indent=2)
    by_file = {}
    for kind, rows in (('assessment', ASSESS), ('observation', OBS), ('intervention', INTV), ('attendance', ATT)):
        for r in rows:
            by_file.setdefault(r.get('file'), []).append(dict(type=kind, id=r['id'], locator=r.get('locator')))
    json.dump({f['filename'] if False else f['path']: by_file.get(f['id'], []) for f in FILES}, open(EVAL / 'file_to_records.json', 'w'), indent=1)
    (EVAL / 'audio_transcripts').mkdir(exist_ok=True)
    for code, m in AUDIO_META.items():
        json.dump(dict(file=m['file']['path'], duration_seconds=m['file']['duration'], teacher=m['teacher']['code'], segments=m['segs']), open(EVAL / 'audio_transcripts' / f'{code}_{m["file"]["filename"]}.json', 'w'), indent=1)
    print('files', len(FILES), 'visits', len(VISITS), 'assess', len(ASSESS), 'obs', len(OBS), 'intv', len(INTV), 'fu', len(FUP), 'att', len(ATT))


if __name__ == '__main__':
    main()



