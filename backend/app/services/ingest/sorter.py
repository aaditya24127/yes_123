"""Works out, for each uploaded file: which school, which teacher, what kind of document, and which date.

Free rules first (file name, headings, names found in the text). Only files the rules are unsure about go to a cheap AI
model (Claude Haiku), and only if a key is configured. The CRP confirms or corrects everything before import.
"""
import difflib, re
from . import readers
from ... import ai

SECTIONS = ['assessments', 'observations', 'followups', 'visits', 'attendance', 'audio', 'roster', 'facts', 'textbooks', 'other']
SECTION_RULES = [   # (section, keywords); a hit in the file name counts most, then the title, then the body
    ('roster', ['teacher roster', 'roster', 'teacher list', 'staff list', 'qualification']),
    ('attendance', ['attendance summary', 'attendance']),
    ('followups', ['follow-up tracker', 'followup tracker', 'tracker', 'interventions register', 'intervention register', 'action plan', 'follow-up', 'followup', 'intervention']),
    ('visits', ['visit log', 'visit_log', 'visit_type', 'onboarding visit', 'crp visit log']),
    ('facts', ['enrolment', 'enrollment', 'girls enrolled', 'cwsn', 'udise', 'school profile']),
    ('textbooks', ['syllabus', 'textbook pdf', 'lesson plan', 'year plan', 'annual plan']),
    ('assessments', ['unit test', 'term exam', 'exam results', 'test results', 'result summary', 'results', 'marks', 'result', 'exam', 'below 40']),
    ('observations', ['visit report', 'visit notes', 'visit note', 'observation form', 'followup visit form', 'follow-up visit form', 'visit form',
                      'field note', 'classroom observation', 'observation', 'feedback']),
]
STOP = {'school', 'schools', 'english', 'medium', 'primary', 'zp', 'zilla', 'parishad', 'the', 'of', 'and', 'high', 'vidyalaya', 'public', 'new', 'pcmc', 'st', 'sant'}


def _norm(s): return re.sub(r'[^a-z0-9 ]+', ' ', (s or '').lower()).strip()


def _tokens(s): return [t for t in _norm(s).split() if t not in STOP and len(t) > 2]


def match_school(text, schools):
    """Returns (school, score 0..1, reason)."""
    low = _norm(text)
    best = (None, 0.0, '')
    for s in schools:
        sc, why = 0.0, ''
        if re.search(rf"\b{re.escape(s['code'].lower())}\b", low): sc, why = 0.95, f"code {s['code']}"
        if s.get('udise_code') and s['udise_code'] in text: sc, why = 1.0, 'UDISE code'
        if _norm(s['name']) and _norm(s['name']) in low: sc, why = max(sc, 0.95), why or 'full school name'
        toks = _tokens(s['name']) + _tokens(s.get('village'))
        hits = [t for t in dict.fromkeys(toks) if re.search(rf'\b{t}\b', low)]
        if toks and hits:
            v = 0.55 + 0.4 * len(hits) / len(set(toks))
            if v > sc: sc, why = v, 'name words: ' + ', '.join(hits)
        if sc > best[1]: best = (s, min(sc, 1.0), why)
    return best


def match_teachers(text, teachers):
    low = ' ' + _norm(text) + ' '
    found = []
    for t in teachers:
        n = _norm(t['full_name'])
        if n and f' {n} ' in low: found.append(t)
    return found


def guess_section(name, rr):
    if rr.fmt in readers.AUDIO: return 'audio', 'it is a recording'
    fname = name.lower().replace('_', ' ')
    title, body = rr.text[:300].lower(), rr.text[300:1800].lower()
    best, why, top = None, '', 0.0
    for sec, kws in SECTION_RULES:
        sc, hit = 0.0, ''
        for k in kws:
            w = 1 + len(k.split()) * 0.5          # longer phrases are more specific
            if k in fname: v = 6 * w
            elif k in title: v = 3 * w
            elif k in body: v = 1 * w
            else: continue
            if v > sc: sc, hit = v, k
        if sc > top: best, why, top = sec, f"mentions '{hit}'", sc
    return best, why


def sort_file(name, rr, schools, teachers, hint_school_id=None, hint_teacher_id=None, data=None):
    """Returns dict(school_id, teacher_id, section, record_date, doc_kind, confidence, sorted_by, reasons)."""
    reasons = []
    section, why = guess_section(name, rr)
    if section: reasons.append(f'Type: {section} ({why})')
    hay = name.replace('_', ' ') + '\n' + rr.text[:4000]
    school, s_score, s_why = match_school(hay, schools)
    ts = match_teachers(hay, teachers)
    if hint_school_id:
        school = next((s for s in schools if str(s['id']) == str(hint_school_id)), school); s_score, s_why = 1.0, 'uploaded for this school'
    if ts and (not school or s_score < 0.8):
        sids = {t['school_id'] for t in ts}
        if len(sids) == 1:
            school = next(s for s in schools if s['id'] in sids); s_score, s_why = 0.85, 'teacher names belong to this school'
    if school: reasons.append(f"School: {school['name']} ({s_why})")
    teacher = None
    if hint_teacher_id:
        teacher = next((t for t in teachers if str(t['id']) == str(hint_teacher_id)), None)
    elif school:
        own = [t for t in ts if t['school_id'] == school['id']]
        if len(own) == 1: teacher = own[0]; reasons.append(f"Teacher: {teacher['full_name']}")
    date = readers.parse_date(name) or readers.parse_date(rr.text[:3000])
    if date: reasons.append(f'Date: {date:%d %b %Y}')
    conf = round((s_score if school else 0) * (1.0 if section else 0.6) * (1.0 if date else 0.85), 2)
    out = dict(school_id=school['id'] if school else None, teacher_id=teacher['id'] if teacher else None, section=section or 'other',
               record_date=date, doc_kind=rr.kind, confidence=conf, sorted_by='rules', reasons=reasons)
    if conf < 0.6:
        out = _ask_ai(name, rr, schools, teachers, out, data)
    return out


def _ask_ai(name, rr, schools, teachers, prev, data):
    """Asks whichever AI config/ai.json names for 'classify_document'. The rules provider just returns the rule guess."""
    code_of = {s['id']: s['code'] for s in schools}
    guess = dict(school_code=code_of.get(prev['school_id']), teacher_code=next((t['teacher_code'] for t in teachers if t['id'] == prev['teacher_id']), None),
                 section=prev['section'], record_date=str(prev['record_date']) if prev['record_date'] else None, confidence=prev['confidence'])
    inp = dict(filename=name, text=rr.text[:3000], rules_guess=guess,
               schools='\n'.join(f"{s['code']}: {s['name']} ({s.get('village') or ''})" for s in schools),
               teachers='\n'.join(f"{t['teacher_code']}: {t['full_name']} ({code_of.get(t['school_id'], '')})" for t in teachers))
    att = []
    if not rr.text and data:
        if rr.fmt == 'pdf':
            import pymupdf
            att = [ai.Attachment('page1.png', 'image/png', pymupdf.open(stream=data, filetype='pdf')[0].get_pixmap(dpi=80).tobytes('png'))]
        elif rr.fmt in readers.IMAGE:
            att = [ai.Attachment(name, readers.MIME[rr.fmt], data)]
    try:
        res = ai.run('classify_document', inp, att)
    except ai.AIUnavailable:
        prev['reasons'].append('AI sorting unavailable'); return prev
    if res.provider == 'rules': return prev
    j = res.data
    s = next((x for x in schools if x['code'] == j.get('school_code')), None)
    t = next((x for x in teachers if x['teacher_code'] == j.get('teacher_code')), None)
    out = dict(prev)
    out.update(school_id=s['id'] if s else prev['school_id'], teacher_id=t['id'] if t else prev['teacher_id'], section=j['section'] or prev['section'],
               record_date=readers.parse_date(j.get('record_date')) or prev['record_date'], confidence=round(max(0.0, min(1.0, float(j['confidence']))), 2),
               sorted_by=res.provider, reasons=prev['reasons'] + [f"AI ({res.provider}): {j['why']}"])
    if j.get('is_handwritten') and rr.kind in ('scanned', 'handwritten'): out['doc_kind'] = 'handwritten'
    return out
