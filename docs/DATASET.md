# CRP Mentor Copilot - demo dataset

Fictional Pune-district cluster (Hinjewadi-Mulshi Cluster 7), 10 schools, 52 teachers, English-only documents. Generated on 2026-10-27 by `generator/build.py` (deterministic; re-run to rebuild everything).

## Time windows

- Window 1 (~4 months before generation): 20 Jun - 10 Jul 2026 (First Unit Test, first CRP visits).
- Window 2 (~2 months before generation): 20 Aug - 5 Sep 2026 (First Term Examination, second CRP visits).
- Cohort A (Window 1 only): S01, S03, S05, S09, S10. Cohort B (both windows): S02, S04, S06, S07, S08.
- Every record has an event date (`record_date`, `visit_date`, `observation_date`...) and the file an upload timestamp (`uploaded_at`). New uploads will carry their real dates; the engine must compute "days overdue / since visit" against the current date (or an explicit `as_of`).

## Folder layout

```

  data\schools\<code>_<school>\<section>\<files>   original uploaded files (sections: assessments, observations, followups, visits, attendance, audio, roster)
  database\seed_data\*.csv                          structured records extracted from those files (ground truth for loading)
  evaluation\ground_truth\                          hidden answer keys (never read by the app)
  generator\                                        Python generator (base.py, render.py, audio.py, audio_scripts.py, build.py, write_docs.py)
```

`storage_path` in `source_files.csv` is relative to the CRP root (e.g. `data/schools/S01_ZP_Wadgaon/assessments/...`). Locally the files stay in `data/`; for Supabase the same relative path becomes the object key in a private bucket, so no DB rows need rewriting.

## Seed tables

| File | Rows | What it holds |
|---|---|---|
| schools.csv | 10 | schools (type, board, medium, grades) |
| teachers.csv | 52 | teachers with classes/subjects taught and joining date |
| source_files.csv | 48 | every uploaded file: path, hash, format, kind, scanned flag, duplicate link, audio duration |
| visits.csv | 75 | school visits and per-teacher classroom observations |
| assessments.csv | 206 | class-level results (students on roll / assessed / below 40% benchmark) with evidence + validation status |
| observations.csv | 48 | CRP observations with need code, severity, status, evidence and locator |
| interventions.csv | 24 | agreed actions linked to observations |
| follow_ups.csv | 24 | follow-up deadlines, status and completion evidence |
| attendance.csv | 10 | monthly attendance vs 90% target (custom-category test) |

Also: `crps.csv`, `school_assignments.csv`. All IDs are deterministic UUIDv5, so reloading is idempotent. Every row has `is_demo = true`.

### Conventions

- **Locator** says where a fact lives in its source: `Sheet 'Class-wise Results', row 7`, `row 12` (CSV line), `page 1, Sr. 9` (PDF table), `paragraph 3`, `table 1, row 2`, `note item 4` (handwritten scan), `audio 02:10-02:45` (recording).
- **validation_status**: `valid`, `invalid` (fails checks), `needs_review`, `conflict` (two sources disagree), `duplicate` (same fact uploaded twice). Only `valid` rows should drive scoring.
- **Severity** (observations): minor / significant / critical, stated in the document wording or in a "Concern level" column. `GOOD_PRACTICE` rows have severity `none`.
- **Benchmark**: a student is below benchmark when scoring under 40% of maximum marks. Data is class-level only; no student-level marks or names.
- **Hindi** starts in Class 5 in SSC schools and Class 1 in CBSE/ICSE schools; Marathi is taught in every school.

## Planted scenarios

| School | Type / board / medium | Classes | Cohort | Scenario |
|---|---|---|---|---|
| S01 ZP School, Wadgaon | Zilla Parishad / Maharashtra State Board (SSC) / Marathi | 1-7 | A | Critical: high learning gap, critical recurring issues, long-overdue follow-ups, no visit for ~110 days |
| S02 Mahavir Jaideep English Medium School | Private Unaided / CBSE / English | 1-10 | B | High learning gap persists across both windows; recently visited; mixed follow-up tiers; attendance below target |
| S03 ZP School, Nandur | Zilla Parishad / Maharashtra State Board (SSC) / Marathi | 1-5 | A | Low learning gap but follow-ups ~100 days overdue and no visit for ~110 days: deadline alert case |
| S04 Rock Public School, Hinjewadi | Private Unaided / ICSE / English | 1-10 | B | Healthy: low gap, issues resolved, follow-up completed, attendance above target |
| S05 PCMC Primary School, Wakad | Municipal Corporation / Maharashtra State Board (SSC) / Marathi | 1-7 | A | No assessment data: provisional score only; recurring needs across two visits |
| S06 Shri Ganesh Vidyalaya, Ambegaon | Government Aided Private / Maharashtra State Board (SSC) / Marathi (semi-English) | 5-10 | B | Duplicate uploads (exact + near) must not inflate recurring need; science practicals recurring |
| S07 St. Mary's English School, Takali | Government Aided Private (Minority) / ICSE / English | 1-10 | B | Conflicting Class 5 Maths figures (Excel vs PDF); overdue follow-ups across 7/15/45/88/99-day tiers |
| S08 ZP School, Mhasoba Wadi | Zilla Parishad / Maharashtra State Board (SSC) / Marathi | 1-7 | B | Improved: Class 3 Marathi reading gap 40% -> 20%; completed intervention; one planned action 7 days overdue |
| S09 Sant Dnyaneshwar English School, Karanje | Private Unaided / CBSE / English | 1-5 | A | New school, no assessments/observations, all teachers never visited: insufficient evidence |
| S10 New English School, Palshi | Government Aided Private / Maharashtra State Board (SSC) / English | 1-10 | A | Invalid/needs-review assessment rows planted; moderate gap |

## Teacher visit patterns

Visited more than once: 16, once: 21, never: 15 (see `evaluation/ground_truth/teacher_visit_patterns.csv`). A never-visited teacher is scored on "time since last visit" from the joining date, with a visible "never observed" flag.

## File inventory

| School | Section | File | Format / kind | Notes |
|---|---|---|---|---|
| S01 | assessments | 2026-06-30_first_unit_test_marks_scan.pdf | pdf / scanned, scanned |  |
| S01 | attendance | 2026-07-08_attendance_summary.xlsx | xlsx / tabular |  |
| S01 | audio | 2026-07-06_class3_maths_lesson_recording.mp3 | mp3 / audio | Synthetic classroom recording (TTS), English |
| S01 | observations | 2026-06-22_field_note_scan.jpg | jpg / handwritten | Handwritten-style English field note, scanned |
| S01 | observations | 2026-07-06_visit_report.docx | docx / narrative |  |
| S02 | assessments | 2026-06-30_first_unit_test_results.xlsx | xlsx / tabular |  |
| S02 | assessments | 2026-09-03_first_term_exam_results.xlsx | xlsx / tabular |  |
| S02 | attendance | 2026-09-03_attendance_summary.xlsx | xlsx / tabular |  |
| S02 | audio | 2026-08-27_class4_maths_lesson_recording.mp3 | mp3 / audio | Synthetic classroom recording (TTS), English |
| S02 | followups | 2026-08-28_followup_tracker.xlsx | xlsx / tabular |  |
| S02 | observations | 2026-06-22_classroom_observation_form.pdf | pdf / form |  |
| S02 | observations | 2026-07-05_classroom_observation_form.pdf | pdf / form |  |
| S02 | observations | 2026-08-27_visit_report.pdf | pdf / narrative |  |
| S03 | assessments | 2026-06-30_unit_test_results.xlsx | xlsx / tabular |  |
| S03 | observations | 2026-06-25_visit_report.pdf | pdf / narrative |  |
| S03 | observations | 2026-07-08_followup_visit_form.pdf | pdf / form |  |
| S04 | assessments | 2026-07-01_unit_test_results.csv | csv / tabular |  |
| S04 | assessments | 2026-09-02_term_exam_results.csv | csv / tabular |  |
| S04 | attendance | 2026-09-02_attendance_summary.csv | csv / tabular |  |
| S04 | observations | 2026-06-26_visit_notes.md | md / narrative |  |
| S04 | observations | 2026-09-02_visit_notes.md | md / narrative |  |
| S05 | observations | 2026-06-23_visit_notes.txt | txt / narrative |  |
| S05 | observations | 2026-07-03_visit_notes.txt | txt / narrative |  |
| S05 | visits | 2026-07-03_crp_visit_log.csv | csv / tabular |  |
| S06 | assessments | 2026-07-02_unit_test_results_note.pdf | pdf / narrative |  |
| S06 | assessments | 2026-09-02_term_exam_results_statement.pdf | pdf / tabular |  |
| S06 | observations | 2026-06-24_visit_report.pdf | pdf / narrative |  |
| S06 | observations | 2026-08-26_visit_report_classes_7_to_9.docx | docx / narrative |  |
| S06 | observations | 2026-08-26_visit_report_classes_7_to_9 (1).docx | docx / narrative | Exact duplicate upload (identical bytes)[duplicate_exact] |
| S06 | observations | 2026-08-28_visit_report_resubmitted.pdf | pdf / narrative | Near-duplicate: same content re-exported as PDF with an added note[possible_duplicate] |
| S07 | assessments | 2026-06-30_unit_test_results.xlsx | xlsx / tabular |  |
| S07 | assessments | 2026-07-03_result_summary_for_crp.pdf | pdf / tabular |  |
| S07 | assessments | 2026-09-03_first_term_exam_results.xlsx | xlsx / tabular |  |
| S07 | audio | 2026-06-27_class6_science_lesson_recording.mp3 | mp3 / audio | Synthetic classroom recording (TTS), English |
| S07 | observations | 2026-06-27_visit_notes.txt | txt / narrative |  |
| S07 | observations | 2026-09-01_visit_notes.txt | txt / narrative |  |
| S08 | assessments | 2026-07-01_unit_test_results.xlsx | xlsx / tabular |  |
| S08 | assessments | 2026-09-04_first_term_results_scan.pdf | pdf / scanned, scanned |  |
| S08 | audio | 2026-09-01_class3_english_reading_recording.mp3 | mp3 / audio | Synthetic classroom recording (TTS), English |
| S08 | followups | 2026-09-03_interventions_register.csv | csv / tabular |  |
| S08 | observations | 2026-06-28_field_note_scan.jpg | jpg / handwritten | Handwritten-style English field note, scanned |
| S08 | observations | 2026-09-01_visit_report_scan.pdf | pdf / scanned, scanned |  |
| S09 | roster | 2026-07-02_teacher_roster.xlsx | xlsx / tabular |  |
| S09 | visits | 2026-07-02_onboarding_visit_note.md | md / narrative |  |
| S10 | assessments | 2026-07-02_unit_test_results.xlsx | xlsx / tabular |  |
| S10 | attendance | 2026-07-07_attendance_summary.csv | csv / tabular |  |
| S10 | observations | 2026-06-24_visit_report.docx | docx / narrative |  |
| S10 | observations | 2026-07-07_visit_report.docx | docx / narrative |  |

## Ground truth

- `evaluation/ground_truth/file_to_records.json` - which records each file should yield (for extraction tests).
- `evaluation/ground_truth/audio_transcripts/*.json` - reference transcripts with segment timestamps for the four recordings.
- `evaluation/ground_truth/scenarios.json`, `teacher_visit_patterns.csv` - intent behind each planted case.

## Rebuild

```
pip install -r generator/requirements.txt
python generator/build.py && python generator/write_docs.py
```
Audio uses edge-tts (needs internet). Output is about 10 MB including audio.