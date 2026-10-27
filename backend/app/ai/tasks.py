"""Every AI job the app can ask for, defined once and independent of who answers it.

A task has: an output JSON schema (every provider's answer is checked against it), and instructions for language-model
providers (system prompt + a function that turns the task input into a message). Non-LLM providers (rules, your own
trained model behind a URL) receive the same `input` dict and must return the same output shape.
"""
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from ..services.prioritization.scorers import NEED_LABEL

KNOWLEDGE = Path(__file__).resolve().parents[1] / 'knowledge' / 'teaching_practices.md'
SECTIONS = ['assessments', 'observations', 'followups', 'visits', 'attendance', 'audio', 'roster', 'facts', 'textbooks', 'other']


def knowledge():
    return KNOWLEDGE.read_text(encoding='utf-8') if KNOWLEDGE.is_file() else ''


@dataclass
class Task:
    name: str
    description: str
    schema: dict
    system: Callable[[], str]
    user: Callable[[dict], str]
    tier: str = 'fast'              # hint only; which model actually runs is decided in config/ai.json
    max_tokens: int = 8000


def _obj(props, required=None):
    return {'type': 'object', 'additionalProperties': False, 'required': required or list(props), 'properties': props}


S = {'type': 'string'}
SN = {'type': ['string', 'null']}
NUM = {'type': 'number'}
NN = {'type': ['number', 'null']}
IN = {'type': ['integer', 'null']}
ARR_S = {'type': 'array', 'items': S}


def _j(x): return json.dumps(x, ensure_ascii=False, default=str, indent=1)


# ------------------------------------------------------------------ 1. which school / teacher / type is this file?
CLASSIFY = Task(
    'classify_document', 'Sort an uploaded file into school, teacher, document type and date.',
    _obj({'school_code': SN, 'teacher_code': SN, 'section': {'type': 'string', 'enum': SECTIONS}, 'record_date': SN,
          'is_handwritten': {'type': 'boolean'}, 'confidence': NUM, 'why': S}),
    lambda: ('You sort documents uploaded by a Cluster Resource Person (CRP) in India into the right school folder. Choose the school and teacher only '
             'from the lists given; use null when the document does not say. Sections: assessments = test or exam results; observations = visit reports, '
             'classroom observation forms, field notes; followups = action trackers; visits = visit logs; attendance; roster = teacher lists; '
             'facts = enrolment or school profile numbers; textbooks = syllabus or textbook; audio = recordings; other = anything else. '
             'record_date as YYYY-MM-DD. confidence 0-1.'),
    lambda i: f"Schools:\n{i['schools']}\n\nTeachers:\n{i['teachers']}\n\nFile name: {i['filename']}\n\nText (start):\n{i.get('text') or '(no text layer; see attachment)'}",
    max_tokens=1500)


# ------------------------------------------------------------------ 2. read records out of a document / scan / transcript
NEED_CODES = list(NEED_LABEL)
EXTRACT_OUT = _obj({
    'visit_date': SN,
    'visit_type': {'type': 'string', 'enum': ['school_visit', 'classroom_observation', 'unknown']},
    'teacher_names': ARR_S,
    'observations': {'type': 'array', 'items': _obj({
        'teacher_name': SN, 'class_label': SN, 'subject': SN, 'need_code': {'type': 'string', 'enum': NEED_CODES}, 'issue_text': S,
        'severity': {'type': 'string', 'enum': ['none', 'minor', 'significant', 'critical']}, 'status': {'type': 'string', 'enum': ['open', 'in_progress', 'resolved']},
        'locator': S, 'evidence_text': S, 'confidence': NUM})},
    'actions': {'type': 'array', 'items': _obj({'teacher_name': SN, 'action': S, 'due_date': SN,
                                                'status': {'type': 'string', 'enum': ['open', 'completed', 'not_completed']}, 'locator': S, 'confidence': NUM})},
    'assessments': {'type': 'array', 'items': _obj({
        'class_no': {'type': 'integer'}, 'subject': S, 'skill': SN, 'teacher_name': SN, 'students_on_roll': IN, 'students_assessed': IN, 'students_below': IN,
        'class_avg_pct': NN, 'test_date': SN, 'exam_type': SN, 'locator': S, 'confidence': NUM})},
    'facts': {'type': 'array', 'items': _obj({'fact_key': S, 'value': NUM, 'locator': S})},
    'summary': S,
})
EXTRACT_SYSTEM = (
    'You read documents from Indian school visits (visit reports, observation forms, handwritten field notes, result sheets, lesson transcripts) '
    'and extract structured records for a mentoring dashboard. Only extract what the document states; never invent numbers. '
    'Every record needs a locator saying exactly where it is (paragraph N / page N, Sr. N / note item N / audio mm:ss-mm:ss) and, for observations, '
    'a short exact quote as evidence_text. Severity comes from the wording or a "concern level" column (critical = urgent or severe, significant = clear '
    'problem, minor = small). A strength or good practice is need_code GOOD_PRACTICE with severity none. confidence is 0-1 (below 0.7 when handwriting '
    'is unclear or the meaning is ambiguous). Students below benchmark = scoring under 40% of maximum marks. Dates as YYYY-MM-DD. '
    'facts.fact_key must be one of the known fact keys given. Need codes: ' + '; '.join(f'{k} = {v}' for k, v in NEED_LABEL.items()))


def _extract_user(i):
    head = (f"School: {i['school']}. Teachers: {', '.join(i['teachers'])}. Document type: {i['section']}. File: {i['filename']}. "
            f"Date from file name: {i.get('record_date')}. Known fact keys: {', '.join(i.get('fact_keys', []))}.")
    if i.get('transcript'):
        return head + '\n\nClassroom recording transcript (use audio mm:ss-mm:ss as locator):\n' + i['transcript']
    if i.get('text'):
        return head + '\n\nDocument text:\n' + i['text'][:60000]
    return head + '\n\nThe document is attached as a scan or photo; read it carefully, including handwriting.'


EXTRACT = Task('extract_records', 'Read observations, actions, test results and facts out of a document or transcript.', EXTRACT_OUT,
               lambda: EXTRACT_SYSTEM, _extract_user, max_tokens=16000)
EXTRACT_SCAN = Task('extract_records_scan', 'Same as extract_records, for scans and photos (needs a model that can see images).', EXTRACT_OUT,
                    lambda: EXTRACT_SYSTEM, _extract_user, tier='smart', max_tokens=16000)


# ------------------------------------------------------------------ 3. speech to text (not a language-model task)
TRANSCRIBE = Task('transcribe', 'Turn a recording into text with timestamps.',
                  _obj({'text': S, 'language': SN, 'segments': {'type': 'array', 'items': _obj({'start': NUM, 'end': NUM, 'text': S})}}),
                  lambda: '', lambda i: '')


# ------------------------------------------------------------------ 4. CRP describes a new factor in plain words
SUGGEST_FACTOR = Task(
    'suggest_factor', 'Turn a plain-words priority idea into a factor definition.',
    _obj({'existing_code': SN, 'name': S, 'description': S, 'fact_key': S, 'fact_label': S, 'unit': SN,
          'entity_scope': {'type': 'string', 'enum': ['school', 'teacher', 'both']},
          'mode': {'type': 'string', 'enum': ['higher', 'lower', 'below_target', 'above_target', 'yes']},
          'low': NN, 'high': NN, 'target': NN, 'explanation': S}),
    lambda: ('A Cluster Resource Person (CRP) in India wants to rank schools or teachers for mentoring visits by a new factor, described in plain words. '
             'If one of the existing factors already covers it, return its code in existing_code. Otherwise define a new factor that scores 0-100 from one '
             'number (or yes/no) stored per school or teacher: fact_key is a short snake_case key (reuse a known fact key when it fits), mode says how the '
             'number becomes priority (higher = more of it means visit sooner; lower = less of it means visit sooner; below_target / above_target need target; '
             'yes = a yes answer means visit sooner). low and high are the values that give score 0 and 100 (for higher/lower). Be realistic for Indian schools. '
             'explanation: one plain sentence for the CRP.'),
    lambda i: (f"Idea: {i['description']}\n\nExisting factors:\n" + '\n'.join(f"{r['code']}: {r['name']} - {r['description']}" for r in i['existing'])
               + '\n\nKnown fact keys:\n' + '\n'.join(f"{f['key']}: {f['label']} ({f.get('unit') or ''})" for f in i['facts'])),
    max_tokens=2000)


# ------------------------------------------------------------------ 5. step 1 of a visit: what the CRP should know before class
VISIT_BRIEF = Task(
    'visit_brief', 'Short pre-visit brief from the school and teacher records.',
    _obj({'summary': S, 'focus_points': ARR_S, 'ask_teacher': ARR_S, 'check_in_class': ARR_S}),
    lambda: ('You prepare a Cluster Resource Person (CRP) for a school visit in India. Using only the records given, write: summary (3-4 plain sentences: '
             'where things stand, what changed since last time); focus_points (2-4 things to look at, most important first, each pointing to a record); '
             'ask_teacher (2-4 respectful questions about earlier feedback and agreed actions); check_in_class (2-4 concrete things to watch for in the lesson). '
             'Be specific and kind. Do not invent facts.'),
    lambda i: _j(i), max_tokens=3000)


# ------------------------------------------------------------------ 6. step 3: questions the CRP asks students
QUESTIONS = Task(
    'student_questions', 'Write 4-5 questions for the CRP to ask students after the lesson.',
    _obj({'questions': {'type': 'array', 'items': _obj({'question': S, 'level': {'type': 'string', 'enum': ['recall', 'understand', 'apply', 'reason', 'foundational']},
                                                        'good_answer': S, 'watch_for': S, 'ask_who': S})},
          'tips': ARR_S}),
    lambda: ('You help a Cluster Resource Person (CRP) check what students learnt in the lesson they just watched. Follow section 6 of this guide exactly '
             '(mix of levels, short spoken questions, language of instruction, expected good answer, common misconception to listen for, ask different '
             'students).\n\n' + knowledge()),
    lambda i: _j(i), tier='smart', max_tokens=4000)


# ------------------------------------------------------------------ 7. step 4: the evaluation
RUBRIC = ['A1 Supportive learning environment', 'A2 Positive behavioural expectations', 'Time on task', 'B1 Lesson facilitation',
          'B2 Checks for understanding', 'B3 Feedback', 'B4 Critical thinking', 'C1 Autonomy', 'C2 Perseverance', 'C3 Social and collaborative skills']
EVALUATE = Task(
    'evaluate_lesson', 'Evaluate a lesson from the transcript, CRP notes, student answers and history.',
    _obj({
        'overall': S,
        'rubric': {'type': 'array', 'items': _obj({'element': {'type': 'string', 'enum': RUBRIC}, 'score': IN, 'evidence': S})},
        'strengths': {'type': 'array', 'items': _obj({'point': S, 'evidence': S})},
        'growth': {'type': 'array', 'items': _obj({'area': S, 'evidence': S, 'why': S, 'try_this': S, 'source': S,
                                                   'need_code': {'type': 'string', 'enum': NEED_CODES},
                                                   'severity': {'type': 'string', 'enum': ['minor', 'significant', 'critical']}})},
        'students': _obj({'summary': S, 'per_question': {'type': 'array', 'items': _obj({'question': S, 'verdict': S, 'note': S})}, 'misconceptions': ARR_S}),
        'compared_with_before': {'type': 'array', 'items': _obj({'issue': S, 'change': {'type': 'string', 'enum': ['improved', 'same', 'worse', 'not_seen']}, 'evidence': S})},
        'next_steps': {'type': 'array', 'items': _obj({'action': S, 'who': S, 'due_in_days': {'type': 'integer'}})},
        'confidence': {'type': 'string', 'enum': ['high', 'medium', 'low']}, 'confidence_reason': S,
        'safety_flag': SN,
    }),
    lambda: ('You evaluate a classroom lesson for a Cluster Resource Person (CRP) in India and write the result the CRP will discuss with the teacher. '
             'Follow the guide below exactly: ground rules (section 1), the framework (section 2, scores 1-5 or null when not observed), reading student '
             'answers (section 5) and the result structure (section 7). Every strength and growth point needs evidence (transcript time, CRP note, student '
             'answer or record). growth: at most 2. next_steps: 1-3. source: the guide source codes, e.g. "S1, S3". safety_flag: null unless there is harm.\n\n'
             + knowledge()),
    lambda i: _j(i), tier='smart', max_tokens=12000)


# ------------------------------------------------------------------ 8. textbook search
FIND_TEXTBOOKS = Task(
    'find_textbooks', 'Find official textbook / syllabus PDFs on the web for a class and subject.',
    _obj({'results': {'type': 'array', 'items': _obj({'title': S, 'url': S, 'publisher': S, 'is_pdf': {'type': 'boolean'}, 'class_no': IN, 'subject': SN, 'language': SN})}}),
    lambda: ('Find official school textbooks or syllabus documents in India (NCERT, state boards such as Maharashtra Balbharati, DIKSHA, SCERTs) that match the '
             'request. Prefer direct PDF links from official government sites. Return only links you actually found in search results; never make up URLs. '
             'Reply with only a JSON object: {"results": [{"title", "url", "publisher", "is_pdf", "class_no", "subject", "language"}]} (up to 8 results).'),
    lambda i: f"Find: {i['query']}. Class {i.get('class_no') or 'any'}, subject {i.get('subject') or 'any'}, board {i.get('board') or 'any'}, "
              f"medium/language {i.get('language') or 'any'}.", max_tokens=4000)


# ------------------------------------------------------------------ 9. free-form question about the data
ASK = Task(
    'ask_copilot', 'Answer a CRP question using the latest records.',
    _obj({'answer': S, 'records_used': ARR_S}),
    lambda: ('You are the CRP Mentor Copilot. Answer the Cluster Resource Person\'s question using only the records provided (they are the latest data in the '
             'system, including newly uploaded files). Plain language, short. If the records do not contain the answer, say so. records_used: the record '
             'references you relied on (e.g. "assessment Class 3 Marathi 2026-06-30", "file 2026-07-06_visit_report.docx").'),
    lambda i: f"Question: {i['question']}\n\nRecords:\n{i['records']}", max_tokens=3000)


TASKS = {t.name: t for t in [CLASSIFY, EXTRACT, EXTRACT_SCAN, TRANSCRIBE, SUGGEST_FACTOR, VISIT_BRIEF, QUESTIONS, EVALUATE, FIND_TEXTBOOKS, ASK]}
