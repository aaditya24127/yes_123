"""Shared constants, schools, teachers and class/subject allocation for the CRP demo dataset."""
import uuid, datetime as dt, random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # the project folder, wherever it lives
DATA = ROOT / 'data' / 'schools'
SEED = ROOT / 'database' / 'seed_data'
EVAL = ROOT / 'evaluation' / 'ground_truth'
ANCHOR = dt.date(2026, 10, 27)   # "today" when the dataset was generated
NS = uuid.UUID('6f1c1d0e-8a54-4b7e-9a57-0c2f6b0d1e11')


def uid(*p):
    return str(uuid.uuid5(NS, ':'.join(str(x) for x in p)))


def D(s):
    return dt.date.fromisoformat(s)


CRP = dict(code='CRP01', name='Anjali Kulkarni', title='Mrs.', cluster='Hinjewadi-Mulshi Cluster 7',
           block='Mulshi', district='Pune', office='Block Education Office, Mulshi, Pune')

# ------------------------------------------------------------------ schools
SCHOOLS = [
    dict(code='S01', name='ZP School, Wadgaon', short='ZP_Wadgaon', stype='Zilla Parishad', board='Maharashtra State Board (SSC)',
         medium='Marathi', g=(1, 7), village='Wadgaon', taluka='Maval', cohort='A', teachers=5),
    dict(code='S02', name='Mahavir Jaideep English Medium School', short='Mahavir_Jaideep_English_Medium', stype='Private Unaided', board='CBSE',
         medium='English', g=(1, 10), village='Wakad', taluka='Mulshi', cohort='B', teachers=7),
    dict(code='S03', name='ZP School, Nandur', short='ZP_Nandur', stype='Zilla Parishad', board='Maharashtra State Board (SSC)',
         medium='Marathi', g=(1, 5), village='Nandur', taluka='Maval', cohort='A', teachers=4),
    dict(code='S04', name='Rock Public School, Hinjewadi', short='Rock_Public_School_Hinjewadi', stype='Private Unaided', board='ICSE',
         medium='English', g=(1, 10), village='Hinjewadi', taluka='Mulshi', cohort='B', teachers=6),
    dict(code='S05', name='PCMC Primary School, Wakad', short='PCMC_Primary_Wakad', stype='Municipal Corporation', board='Maharashtra State Board (SSC)',
         medium='Marathi', g=(1, 7), village='Wakad', taluka='Haveli', cohort='A', teachers=4),
    dict(code='S06', name='Shri Ganesh Vidyalaya, Ambegaon', short='Shri_Ganesh_Vidyalaya_Ambegaon', stype='Government Aided Private', board='Maharashtra State Board (SSC)',
         medium='Marathi (semi-English)', g=(5, 10), village='Ambegaon', taluka='Haveli', cohort='B', teachers=6),
    dict(code='S07', name="St. Mary's English School, Takali", short='St_Marys_English_School_Takali', stype='Government Aided Private (Minority)', board='ICSE',
         medium='English', g=(1, 10), village='Takali', taluka='Haveli', cohort='B', teachers=6),
    dict(code='S08', name='ZP School, Mhasoba Wadi', short='ZP_Mhasoba_Wadi', stype='Zilla Parishad', board='Maharashtra State Board (SSC)',
         medium='Marathi', g=(1, 7), village='Mhasoba Wadi', taluka='Mulshi', cohort='B', teachers=5),
    dict(code='S09', name='Sant Dnyaneshwar English School, Karanje', short='Sant_Dnyaneshwar_English_School_Karanje', stype='Private Unaided', board='CBSE',
         medium='English', g=(1, 5), village='Karanje', taluka='Mulshi', cohort='A', teachers=3),
    dict(code='S10', name='New English School, Palshi', short='New_English_School_Palshi', stype='Government Aided Private', board='Maharashtra State Board (SSC)',
         medium='English', g=(1, 10), village='Palshi', taluka='Maval', cohort='A', teachers=6),
]
SBY = {s['code']: s for s in SCHOOLS}
for _s in SCHOOLS:
    _s['id'] = uid('school', _s['code'])
    _s['udise'] = '2725' + str(abs(hash(_s['code'])) % 10**7).zfill(7) if False else '2725' + str(int(uuid.uuid5(NS, 'udise' + _s['code']).int % 10**7)).zfill(7)
    _s['folder'] = f"{_s['code']}_{_s['short']}"

# ------------------------------------------------------------------ names
POOLS = {
    'gen': (['Sunita', 'Anita', 'Vandana', 'Meena', 'Sarika', 'Rekha', 'Pooja', 'Shubhangi', 'Kavita', 'Manisha', 'Smita', 'Jyoti', 'Aarti', 'Shweta', 'Nilam', 'Priya',
             'Sheetal', 'Archana', 'Mangal', 'Rupali', 'Sushma', 'Deepali', 'Swati', 'Neha', 'Asha', 'Vaishali', 'Madhuri', 'Trupti', 'Ujwala', 'Kirti'],
            ['Ramesh', 'Suresh', 'Ganesh', 'Prakash', 'Sanjay', 'Vijay', 'Dattatray', 'Balasaheb', 'Sachin', 'Nitin', 'Sandeep', 'Rahul', 'Amol', 'Santosh', 'Mahesh',
             'Yogesh', 'Vishal', 'Anil', 'Dinesh', 'Pravin', 'Rajendra', 'Shivaji', 'Tukaram', 'Bhausaheb', 'Dnyaneshwar', 'Kailas', 'Sudhir', 'Ajay'],
            ['Patil', 'Jadhav', 'Pawar', 'Shinde', 'More', 'Kamble', 'Gaikwad', 'Deshmukh', 'Kulkarni', 'Joshi', 'Bhosale', 'Chavan', 'Salunkhe', 'Mane', 'Kale', 'Thorat',
             'Waghmare', 'Lonkar', 'Dhumal', 'Nimbalkar', 'Kadam', 'Gawade', 'Sonawane', 'Bhalerao', 'Tambe', 'Wagh', 'Shelar', 'Ghule', 'Barde', 'Londhe', 'Mohite',
             'Navale', 'Khandagale', 'Raut', 'Phadtare', 'Kharat']),
    'chr': (['Mary', 'Jacinta', 'Sheeba', 'Rita', 'Lydia', 'Flavia'], ['Joseph', 'Peter', 'Anthony', 'Francis', 'John', 'Cyril'],
            ["D'Souza", 'Fernandes', 'Pereira', 'Gonsalves', 'Rodrigues', 'Lobo', 'Mascarenhas']),
    'mus': (['Shabana', 'Farhana', 'Nasreen', 'Rukhsana', 'Yasmin'], ['Imran', 'Mohsin', 'Irfan', 'Asif', 'Javed'],
            ['Sheikh', 'Shaikh', 'Pathan', 'Sayyed', 'Inamdar', 'Mulla', 'Attar']),
    'mig': (['Pooja', 'Neelam', 'Sushila', 'Ritu', 'Seema'], ['Anil', 'Rakesh', 'Sandeep', 'Manoj', 'Deepak'],
            ['Yadav', 'Mishra', 'Tiwari', 'Singh', 'Gupta', 'Agarwal', 'Pandey', 'Sharma']),
    'jain': (['Pratibha', 'Nirmala', 'Sunanda'], ['Mahavir', 'Rajesh', 'Dilip'], ['Shah', 'Oswal', 'Chordia', 'Bafna', 'Gandhi']),
}
MIX = {
    'S01': ['gen'] * 5, 'S02': ['jain', 'gen', 'mig', 'gen', 'jain', 'mig', 'gen'], 'S03': ['gen'] * 4,
    'S04': ['mig', 'gen', 'mus', 'gen', 'mig', 'chr'], 'S05': ['gen', 'mus', 'gen', 'gen'],
    'S06': ['gen'] * 5 + ['mus'], 'S07': ['chr', 'chr', 'gen', 'chr', 'gen', 'chr'],
    'S08': ['gen'] * 5, 'S09': ['gen', 'mus', 'gen'], 'S10': ['gen', 'gen', 'chr', 'gen', 'mus', 'gen'],
}
QUALS = ['D.Ed.', 'D.Ed., B.A.', 'B.Ed.', 'B.A., B.Ed.', 'B.Sc., B.Ed.', 'M.A., B.Ed.', 'M.Sc., B.Ed.', 'D.Ed., B.Ed.']


def subjects_for(school, g):
    s = ['Marathi', 'English', 'Mathematics']
    hindi_from = 1 if school['board'] in ('CBSE', 'ICSE') else 5
    if g >= hindi_from:
        s.append('Hindi')
    s += ['EVS'] if g <= 5 else ['Science', 'Social Science']
    return s


def _chunks(items, n):
    n = max(1, min(n, len(items)))
    k, r = divmod(len(items), n)
    out, i = [], 0
    for j in range(n):
        step = k + (1 if j < r else 0)
        out.append(items[i:i + step]); i += step
    return out


def build_teachers():
    rnd = random.Random(20261027)
    teachers, used = [], set()
    for s in SCHOOLS:
        n, gf, gt = s['teachers'], *s['g']
        grades = list(range(gf, gt + 1))
        alloc = [dict(classes=[], subjects=set(), pairs=[]) for _ in range(n)]
        if gt <= 7:                                   # class-teacher style (ZP / municipal)
            for i, ch in enumerate(_chunks(grades, n)):
                for g in ch:
                    for sub in subjects_for(s, g):
                        alloc[i]['pairs'].append((g, sub))
        else:
            pri = [g for g in grades if g <= 5] if gf <= 1 else []
            upp = [g for g in grades if g > 5] if gf <= 1 else grades
            npri = max(2, round(n * 0.4)) if pri else 0
            for i, ch in enumerate(_chunks(pri, npri) if pri else []):
                for g in ch:
                    for sub in subjects_for(s, g):
                        alloc[i]['pairs'].append((g, sub))
            order = ['Marathi', 'English', 'Mathematics', 'Science', 'Hindi', 'Social Science']
            nup = n - npri
            for k, sub in enumerate(order):
                t = npri + (k % nup)
                for g in upp:
                    if sub in subjects_for(s, g):
                        alloc[t]['pairs'].append((g, sub))
            # grade 5 in S06 etc. handled by the specialists; EVS for grade 5 in 6-10 schools
            for g in upp:
                if 'EVS' in subjects_for(s, g):
                    alloc[npri + (3 % nup)]['pairs'].append((g, 'EVS'))
        for i in range(n):
            pool = POOLS[MIX[s['code']][i]]
            female = rnd.random() < 0.58
            while True:
                first = rnd.choice(pool[0] if female else pool[1]); sur = rnd.choice(pool[2])
                if (first, sur) not in used:
                    used.add((first, sur)); break
            title = ('Mrs.' if rnd.random() < 0.75 else 'Ms.') if female else 'Mr.'
            if s['code'] == 'S09':
                joined = D('2026-06-15')
            else:
                joined = D('2008-06-15') + dt.timedelta(days=rnd.randint(0, 365 * 16))
            pairs = sorted(set(alloc[i]['pairs']))
            teachers.append(dict(
                id=uid('teacher', s['code'], i + 1), code=f"{s['code']}-T{i + 1:02d}", school=s['code'], idx=i, name=f'{first} {sur}', title=title,
                designation=('Headmistress' if female else 'Headmaster') if i == 0 else ('Assistant Teacher' if gt <= 7 or (pairs and pairs[0][0] <= 5) else 'Subject Teacher'),
                qualification=rnd.choice(QUALS), joined=joined, pairs=pairs,
                classes=sorted({p[0] for p in pairs}), subjects=sorted({p[1] for p in pairs})))
    return teachers


TEACHERS = build_teachers()


def tlist(code):
    return [t for t in TEACHERS if t['school'] == code]


def teacher_for(code, cls, subj):
    for t in tlist(code):
        if (cls, subj) in t['pairs']:
            return t
    return None


def tname(t):
    return f"{t['title']} {t['name']}"


if __name__ == '__main__':
    for s in SCHOOLS:
        print(s['code'], s['name'], s['g'], s['medium'])
        for t in tlist(s['code']):
            print('  ', t['code'], tname(t), t['designation'], 'classes', t['classes'], 'subs', t['subjects'])
