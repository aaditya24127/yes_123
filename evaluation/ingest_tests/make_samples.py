"""Makes a few realistic new files (not in the demo set) to test the upload pipeline end to end.
Run from the project folder:  backend\\.venv\\Scripts\\python evaluation\\ingest_tests\\make_samples.py
Writes to evaluation/ingest_tests/samples/."""
from pathlib import Path
import csv, openpyxl

OUT = Path(__file__).resolve().parent / 'samples'
OUT.mkdir(exist_ok=True)

# 1. New term results for ZP School, Nandur (S03): learning gap got worse in Class 4 Mathematics
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Class-wise Results'
ws.append(['School', 'ZP School, Nandur']); ws.append(['Examination', 'First Term Examination']); ws.append([])
ws.append(['Sr.', 'Class', 'Div', 'Subject', 'Skill assessed', 'Subject teacher', 'On roll', 'Assessed', 'Below 40%', 'Max marks', 'Avg %', 'Test date'])
rows = [(1, 3, 'A', 'Marathi', 'reading', '', 34, 33, 6, 50, 61, '05/10/2026'), (2, 3, 'A', 'Mathematics', 'number operations', '', 34, 33, 9, 50, 55, '05/10/2026'),
        (3, 4, 'A', 'Mathematics', 'number operations', '', 36, 35, 17, 50, 41, '05/10/2026'), (4, 4, 'A', 'Marathi', 'reading comprehension', '', 36, 34, 8, 50, 58, '05/10/2026'),
        (5, 5, 'A', 'English', 'reading comprehension', '', 30, 31, 12, 50, 47, '05/10/2026')]   # last row is invalid: more assessed than on roll
for r in rows: ws.append(list(r))
wb.save(OUT / 'nandur_first_term_results_oct2026.xlsx')

# 2. School profile numbers for the whole cluster (girls enrolled, total, CWSN)
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Enrolment'
ws.append(['School', 'Total enrolment', 'Girls', 'CWSN'])
for name, tot, girls, cwsn in [('ZP School, Wadgaon', 182, 97, 4), ('Mahavir Jaideep English Medium School', 640, 290, 6), ('ZP School, Nandur', 171, 88, 2),
                               ('Rock Public School, Hinjewadi', 980, 451, 9), ('PCMC Primary School, Wakad', 420, 212, 7)]:
    ws.append([name, tot, girls, cwsn])
wb.save(OUT / 'cluster_enrolment_profile_2026.xlsx')

# 3. October attendance for Nandur as CSV
with open(OUT / 'nandur_attendance_2026-10.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f); w.writerow(['month', 'working_days', 'avg_daily_attendance_pct', 'target_pct'])
    w.writerow(['2026-09', 22, 86.0, 90]); w.writerow(['2026-10', 18, 78.5, 90])

# 4. A narrative note with no school name in the file name (needs the sorter to read the text)
(OUT / 'notes_from_tuesday.txt').write_text(
    'Visit notes - Sant Dnyaneshwar English School, Karanje\nDate: 20 October 2026\n\n'
    'Observed Mrs. Yasmin Mulla, Class 3 English. Children read the lesson in chorus; when asked individually, about half could not read the second paragraph.\n'
    'Concern level: significant. Agreed action: start 20 minutes of small-group guided reading daily; review by 20 November 2026.\n', encoding='utf-8')
print('samples written to', OUT)
