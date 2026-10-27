"""Generates docs/DATASET.md from the seed CSVs (run after build.py)."""
import csv, collections
from pathlib import Path
R = Path(r'D:\CRP'); S = R / 'database' / 'seed_data'
rd = lambda n: list(csv.DictReader(open(S / n, encoding='utf-8')))
schools = {s['id']: s for s in rd('schools.csv')}
files = rd('source_files.csv')
cnt = {n: len(rd(n)) for n in ['schools.csv', 'teachers.csv', 'source_files.csv', 'visits.csv', 'assessments.csv', 'observations.csv', 'interventions.csv', 'follow_ups.csv', 'attendance.csv']}
import json
scen = json.load(open(R / 'evaluation' / 'ground_truth' / 'scenarios.json'))
L = ['# CRP Mentor Copilot - demo dataset', '',
     'Fictional Pune-district cluster (Hinjewadi-Mulshi Cluster 7), 10 schools, 52 teachers, English-only documents. '
     f'Generated on {scen["generated_on"]} by `generator/build.py` (deterministic; re-run to rebuild everything).', '',
     '## Time windows', '', '- Window 1 (~4 months before generation): 20 Jun - 10 Jul 2026 (First Unit Test, first CRP visits).',
     '- Window 2 (~2 months before generation): 20 Aug - 5 Sep 2026 (First Term Examination, second CRP visits).',
     '- Cohort A (Window 1 only): S01, S03, S05, S09, S10. Cohort B (both windows): S02, S04, S06, S07, S08.',
     '- Every record has an event date (`record_date`, `visit_date`, `observation_date`...) and the file an upload timestamp (`uploaded_at`). New uploads will carry their real dates; the engine must compute "days overdue / since visit" against the current date (or an explicit `as_of`).', '',
     '## Folder layout', '', '```', 'D:\\CRP\\', '  data\\schools\\<code>_<school>\\<section>\\<files>   original uploaded files (sections: assessments, observations, followups, visits, attendance, audio, roster)',
     '  database\\seed_data\\*.csv                          structured records extracted from those files (ground truth for loading)',
     '  evaluation\\ground_truth\\                          hidden answer keys (never read by the app)',
     '  generator\\                                        Python generator (base.py, render.py, audio.py, audio_scripts.py, build.py, write_docs.py)',
     '```', '',
     '`storage_path` in `source_files.csv` is relative to the CRP root (e.g. `data/schools/S01_ZP_Wadgaon/assessments/...`). Locally the files stay in `data/`; for Supabase the same relative path becomes the object key in a private bucket, so no DB rows need rewriting.', '',
     '## Seed tables', '', '| File | Rows | What it holds |', '|---|---|---|']
desc = {'schools.csv': 'schools (type, board, medium, grades)', 'teachers.csv': 'teachers with classes/subjects taught and joining date', 'source_files.csv': 'every uploaded file: path, hash, format, kind, scanned flag, duplicate link, audio duration',
        'visits.csv': 'school visits and per-teacher classroom observations', 'assessments.csv': 'class-level results (students on roll / assessed / below 40% benchmark) with evidence + validation status',
        'observations.csv': 'CRP observations with need code, severity, status, evidence and locator', 'interventions.csv': 'agreed actions linked to observations', 'follow_ups.csv': 'follow-up deadlines, status and completion evidence',
        'attendance.csv': 'monthly attendance vs 90% target (custom-category test)'}
for k, v in cnt.items(): L.append(f'| {k} | {v} | {desc[k]} |')
L += ['', 'Also: `crps.csv`, `school_assignments.csv`. All IDs are deterministic UUIDv5, so reloading is idempotent. Every row has `is_demo = true`.', '',
      '### Conventions', '', '- **Locator** says where a fact lives in its source: `Sheet \'Class-wise Results\', row 7`, `row 12` (CSV line), `page 1, Sr. 9` (PDF table), `paragraph 3`, `table 1, row 2`, `note item 4` (handwritten scan), `audio 02:10-02:45` (recording).',
      '- **validation_status**: `valid`, `invalid` (fails checks), `needs_review`, `conflict` (two sources disagree), `duplicate` (same fact uploaded twice). Only `valid` rows should drive scoring.',
      '- **Severity** (observations): minor / significant / critical, stated in the document wording or in a "Concern level" column. `GOOD_PRACTICE` rows have severity `none`.',
      '- **Benchmark**: a student is below benchmark when scoring under 40% of maximum marks. Data is class-level only; no student-level marks or names.',
      '- **Hindi** starts in Class 5 in SSC schools and Class 1 in CBSE/ICSE schools; Marathi is taught in every school.', '',
      '## Planted scenarios', '', '| School | Type / board / medium | Classes | Cohort | Scenario |', '|---|---|---|---|---|']
for s in schools.values():
    L.append(f"| {s['code']} {s['name']} | {s['school_type']} / {s['board']} / {s['medium']} | {s['grade_from']}-{s['grade_to']} | {scen['cohorts'][s['code']]} | {scen['scenarios'][s['code']]} |")
L += ['', '## Teacher visit patterns', '']
pat = collections.Counter(r['pattern'] for r in csv.DictReader(open(R / 'evaluation' / 'ground_truth' / 'teacher_visit_patterns.csv', encoding='utf-8')))
L.append(f"Visited more than once: {pat['multiple']}, once: {pat['once']}, never: {pat['never']} (see `evaluation/ground_truth/teacher_visit_patterns.csv`). "
         'A never-visited teacher is scored on "time since last visit" from the joining date, with a visible "never observed" flag.')
L += ['', '## File inventory', '', '| School | Section | File | Format / kind | Notes |', '|---|---|---|---|---|']
for f in sorted(files, key=lambda x: (schools[x['school_id']]['code'], x['section'], x['record_date'])):
    k = f['doc_kind'] + (', scanned' if f['is_scanned'] == 'true' and f['doc_kind'] != 'handwritten' else '')
    note = f['notes'] or (f"{round(float(f['duration_seconds']) / 60, 1)} min audio" if f['duration_seconds'] else '')
    if f['processing_status'] != 'validated': note = (note + ' ').strip() + f"[{f['processing_status']}]"
    L.append(f"| {schools[f['school_id']]['code']} | {f['section']} | {f['original_filename']} | {f['file_format']} / {k} | {note} |")
L += ['', '## Ground truth', '', '- `evaluation/ground_truth/file_to_records.json` - which records each file should yield (for extraction tests).',
      '- `evaluation/ground_truth/audio_transcripts/*.json` - reference transcripts with segment timestamps for the four recordings.',
      '- `evaluation/ground_truth/scenarios.json`, `teacher_visit_patterns.csv` - intent behind each planted case.', '',
      '## Rebuild', '', '```', 'pip install -r generator/requirements.txt', 'python generator/build.py && python generator/write_docs.py', '```',
      'Audio uses edge-tts (needs internet). Output is about 10 MB including audio.']
(R / 'docs').mkdir(exist_ok=True)
(R / 'docs' / 'DATASET.md').write_text('\n'.join(L), encoding='utf-8')
(R / 'generator' / 'requirements.txt').write_text('openpyxl\npandas\npython-docx\nreportlab\npymupdf\npillow\nnumpy\nedge-tts\nmutagen\nimageio-ffmpeg\n', encoding='utf-8')
print('docs written')

