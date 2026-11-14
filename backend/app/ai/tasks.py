"""Every AI job the app can ask for, defined once and independent of who answers it.

A task has: an output JSON schema (every provider's answer is checked against it), and instructions for language-model
providers (system prompt + a function that turns the task input into a message). Non-LLM providers (rules, your own
trained model behind a URL) receive the same `input` dict and must return the same output shape.
"""
import json, re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from ..services.prioritization.scorers import NEED_LABEL

KNOWLEDGE = Path(__file__).resolve().parents[1] / 'knowledge' / 'teaching_practices.md'
SECTIONS = ['assessments', 'observations', 'followups', 'visits', 'attendance', 'audio', 'roster', 'facts', 'textbooks', 'other']


def knowledge(sections=None):
    """The teaching guide, whole or only the numbered sections a job needs (a shorter prompt answers faster)."""
    text = KNOWLEDGE.read_text(encoding='utf-8') if KNOWLEDGE.is_file() else ''
    if not sections: return text
    parts = re.split(r'(?m)^(?=## \d+\. )', text)
    keep = [p for p in parts if (m := re.match(r'## (\d+)\.', p)) and int(m.group(1)) in sections]
    return ''.join(keep) or text


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
    'facts.fact_key must be one of the known fact keys given. summary = ONE short sentence (under 25 words) saying what the document is; never list or explain rows you left out. Need codes: ' + '; '.join(f'{k} = {v}' for k, v in NEED_LABEL.items()))


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
             'Be specific and kind. Do not invent facts. Use simple everyday words and very short sentences (summary: at most 3 sentences; every point: at most 15 words, one idea). Do not quote score or rank numbers: say in words how urgent a visit is. '
             'If the records hold an assessment (spoken questions the teacher answered before the visit), use its focus points and weak areas in focus_points and ask_teacher.'),
    lambda i: _j(i), max_tokens=3000)


# ------------------------------------------------------------------ 6. step 3: questions the CRP asks students
QUESTIONS = Task(
    'student_questions', 'Write 4-5 questions for the CRP to ask students after the lesson.',
    _obj({'questions': {'type': 'array', 'items': _obj({'question': S, 'level': {'type': 'string', 'enum': ['recall', 'understand', 'apply', 'reason', 'foundational']},
                                                        'good_answer': S, 'watch_for': S, 'ask_who': S})},
          'tips': ARR_S}),
    lambda: ('You help a Cluster Resource Person (CRP) check what students learnt in the lesson they just watched. Follow section 6 of this guide exactly '
             '(mix of levels, short spoken questions, language of instruction, expected good answer, common misconception to listen for, ask different '
             'students). Keep everything SHORT: exactly 4 questions (one each of recall, understand, apply, reason; for Classes 1 to 5 add a 5th foundational '
             'reading question). question: at most 20 words. good_answer: at most 15 words. watch_for: at most 12 words. ask_who: at most 6 words. '
             'tips: exactly 2, each at most 12 words.\n\n' + knowledge((1, 5, 6))),
    lambda i: _j(i), tier='fast', max_tokens=1500)


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
             'answers (section 5) and the result structure (section 7). Write for a busy CRP and a teacher: very short sentences in simple everyday words, '
             'one idea each (overall: 3 or 4 short sentences); no jargon and no framework names or codes inside the sentences. Every strength and growth point needs evidence (transcript time, CRP note, student '
             'answer or record). growth: at most 2. In every growth try_this, name something cheap the teacher already has (chalk and blackboard, pencils, slates, stones, paper, a rope, the school yard) '
             'and say exactly how to use it in this lesson, for example "draw the triangle on the board, then let each group make it with 3 pencils". next_steps: 1-3. source: the guide source codes, e.g. "S1, S3". safety_flag: null unless there is harm.\n\n'
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


# ------------------------------------------------------------------ 8. visit notes: a photo of handwriting -> text, and any language -> English
READ_PHOTO = Task(
    'read_note_photo', 'Copy the handwritten or printed notes in a photo into text, in the language they are written in.',
    _obj({'text': S, 'language': SN}),
    lambda: ('You copy a Cluster Resource Person\'s handwritten or printed visit notes from a photo into plain text. Write exactly what is written, line by line, '
             'in the language it is written in (Marathi, Hindi, English or a mix). Do not translate, summarise, correct or add anything. Keep bullet points as lines '
             'starting with "- ". If a word cannot be read, write [unclear]. If the photo has no writing, return an empty text. language = the main language you saw.'),
    lambda i: 'Copy the notes in the attached photo.', tier='smart', max_tokens=4000)

NOTES_TO_ENGLISH = Task(
    'notes_to_english', 'Turn visit notes spoken or written in any Indian language (or a mix) into plain English.',
    _obj({'english': S, 'language': SN, 'already_english': {'type': 'boolean'}}),
    lambda: ('You translate a Cluster Resource Person\'s visit notes into clear, simple English. The notes may be Marathi, Hindi, any other Indian language, '
             'English, or a mix of them (also Indian words written in English letters). Keep the meaning and every detail, keep names and numbers exactly, keep the line '
             'breaks and bullet points, and do not add or leave out anything. If the notes are already fully in English, return them unchanged and set already_english to true. '
             'language = the main language of the notes.'),
    lambda i: i['text'][:20000], max_tokens=6000)


# ------------------------------------------------------------------ 9. before-visit assessment of the teacher (spoken questions, then the report)
FINAL_QUESTION = 'Walk us through your complete way of teaching this topic. How will you work on it step by step in the classroom?'
FINAL_POINTS = ['Starts with a hook or a question that links to what students already know', 'Explains the idea in small steps with at least one clear example',
                'Uses a real object, picture, activity or tool, not only the board', 'Checks understanding during the lesson, not only at the end',
                'Gives students practice and support for those who find it hard', 'Ends with a recap, homework or a way to see what was learned']
RATING = {'type': 'string', 'enum': ['strong', 'some', 'weak', 'not_mentioned']}

ASSESS_QUESTIONS = Task(
    'assessment_questions', "Write the spoken questions of a teacher's before-visit assessment (about 60% subject knowledge, 40% teaching method).",
    _obj({'questions': {'type': 'array', 'items': _obj({'kind': {'type': 'string', 'enum': ['knowledge', 'teaching']}, 'question': S,
                                                                                     'expected_points': ARR_S, 'common_mistakes': ARR_S})}}),
    lambda: ('You prepare a spoken interview for a school teacher in India before the mentor (CRP) visits. The teacher hears each question read aloud and answers by speaking for '
             'about 30 to 90 seconds, so every question must be short (under 30 words), clear, in simple English, and answerable without writing, drawing or opening a book. '
             'Follow the given board, class, subject and chapter exactly and use the real ideas and words of that chapter. '
             '"knowledge" questions check how well the teacher knows the topic: ask why, how, what is the difference, what happens if, or ask for a small worked example; the level is '
             'what a teacher of that class needs to know: the chapter itself and at most one step deeper, NEVER ideas from a higher class (for example no cosine rule for class 7). "teaching" questions check how the teacher teaches this chapter: how to introduce it, which example, '
             'object, activity or tool to use, how to check understanding, how to help weaker students, which student mistakes to expect. All questions must be different. '
             'Do NOT ask the final question "Walk us through your complete way of teaching": the system adds it. Put all knowledge questions first, then the teaching ones, and give exactly '
             'the number of each kind that is asked for. For each question give expected_points: 3 to 5 short points that a good answer contains (kept for the mentor only), and '
             'common_mistakes: 0 to 3 mistakes teachers or students often make on it. No names and no personal questions.'),
    lambda i: _j(i), max_tokens=3500)

ASSESS_REPORT = Task(
    'assessment_report', "Write the report of a teacher's before-visit assessment from what the teacher said.",
    _obj({
        'summary': S,
        'questions': {'type': 'array', 'items': _obj({'n': {'type': 'integer'}, 'score': {'type': 'integer'}, 'said': S, 'covered': ARR_S, 'missing': ARR_S, 'comment': S})},
        'strengths': ARR_S, 'changes': ARR_S,
        'better_methods': {'type': 'array', 'items': _obj({'idea': S, 'why': S})},
        'do': ARR_S, 'dont': ARR_S,
        'misconceptions': {'type': 'array', 'items': _obj({'misconception': S, 'fix_given': S, 'fix_is': {'type': 'string', 'enum': ['correct', 'partly', 'incorrect', 'not_given']}, 'note': S})},
        'tools': {'type': 'array', 'items': _obj({'name': S, 'kind': S, 'fits': {'type': 'string', 'enum': ['fits', 'partly', 'does_not_fit']}, 'note': S})},
        'checking_understanding': _obj({'rating': RATING, 'note': S}),
        'weaker_students': _obj({'rating': RATING, 'note': S}),
        'board_class_fit': _obj({'rating': {'type': 'string', 'enum': ['good', 'partly', 'poor']}, 'note': S}),
        'visit_focus': ARR_S,
    }),
    lambda: ('You write the report of a teacher\'s spoken assessment before a mentor visit (the mentor is called the CRP). The reader is the CRP and the teacher. Write in formal, plain English: '
             'short sentences, simple words, no jargon, no talk about AI. Judge ONLY what the teacher said. If something was not said write "not mentioned"; never invent. '
             'Answers may have speech-to-text mistakes: do not blame the teacher for a wrongly heard word. The answers can be in any language: write everything in English. '
             'For every question give a score 0 to 100: for a knowledge question how accurate and complete the answer is compared with expected_points and the real subject content; for a '
             'teaching question how clear, suitable for the class, and practical the method is. An empty answer scores 0. "said" = a fair short summary (max 35 words) or a short quote of what '
             'the teacher said; covered / missing = which expected points were and were not covered. strengths and changes: 2 to 4 each, specific to the answers. better_methods: 2 to 4 better '
             'tools or methods that fit this chapter, class and board (for example a real object, a free simulation such as PhET or GeoGebra, a DIKSHA lesson, an outdoor activity), each with a short why. '
             'do and dont: 3 to 5 clear steps each for what the teacher should look at, learn and avoid before the visit. misconceptions: only student mistakes the TEACHER named; say whether the fix '
             'described is correct, partly correct, incorrect, or not given (empty list if none were named). tools: only websites, apps, simulations or materials the TEACHER named, and whether '
             'they fit this chapter and class (empty list if none). checking_understanding and weaker_students: how well the answers show it (strong, some, weak, not_mentioned) with one short '
             'note. board_class_fit: do the content, depth and examples match the given board and class. visit_focus: 3 to 5 specific things the CRP should watch for during the visit. '
             'Confidence is measured separately: do not score it. Return one entry in "questions" for every question number given.'),
    lambda i: _j(i), tier='smart', max_tokens=6000)


TASKS = {t.name: t for t in [CLASSIFY, EXTRACT, EXTRACT_SCAN, TRANSCRIBE, SUGGEST_FACTOR, VISIT_BRIEF, QUESTIONS, EVALUATE, FIND_TEXTBOOKS, ASK, READ_PHOTO, NOTES_TO_ENGLISH, ASSESS_QUESTIONS, ASSESS_REPORT]}
