"""The free fallback for every task: plain rules, no AI, no cost. Always available, so the app works with no keys at all.
Answers are simpler and are marked as rule-based so the CRP knows an AI would do better."""
import re
from difflib import SequenceMatcher

from .base import Provider
from ..registry import Unsupported

NOTE = '(Rule-based answer: no AI was used. Switch on an AI provider in config/ai.json for a fuller answer.)'


class RulesProvider(Provider):
    def available(self): return True, 'always available (free, no AI)'

    def run(self, task, input, attachments):
        fn = getattr(self, task.name, None)
        if not fn: raise Unsupported('no rule-based version of this task')
        return fn(input), dict(model='rules', cost_usd=0)

    # ------------------------------------------------------------------
    def classify_document(self, i):
        g = i.get('rules_guess') or {}
        return dict(school_code=g.get('school_code'), teacher_code=g.get('teacher_code'), section=g.get('section') or 'other',
                    record_date=g.get('record_date'), is_handwritten=False, confidence=float(g.get('confidence') or 0), why='file name and text rules')

    def extract_records(self, i):
        return dict(visit_date=i.get('record_date'), visit_type='unknown', teacher_names=[], observations=[], actions=[], assessments=[], facts=[],
                    summary='Stored without reading: narrative documents, scans and recordings need an AI provider to turn them into records. ' + NOTE)

    extract_records_scan = extract_records

    def transcribe(self, i):
        raise Unsupported('speech-to-text needs Whisper (local) or a speech provider')

    # ------------------------------------------------------------------
    def suggest_factor(self, i):
        desc = i['description']; low = desc.lower()
        words = set(re.findall(r'[a-z]+', low)) - {'the', 'a', 'of', 'with', 'more', 'less', 'school', 'schools', 'number', 'should', 'be', 'higher', 'priority', 'and', 'in', 'to'}
        best, best_s = None, 0.0
        for f in i.get('existing', []):
            hay = (f['name'] + ' ' + f.get('description', '')).lower()
            s = len(words & set(re.findall(r'[a-z]+', hay))) / max(1, len(words))
            s = max(s, SequenceMatcher(None, low, f['name'].lower()).ratio())
            if s > best_s: best, best_s = f, s
        known = {f['key']: f for f in i.get('facts', [])}
        fk = next((k for k, f in known.items() if any(w in (f['label'] + ' ' + k).lower() for w in words if len(w) > 3)), None)
        if best and best_s >= 0.6 and not fk:
            return dict(existing_code=best['code'], name=best['name'], description=best.get('description', ''), fact_key='', fact_label='', unit=None,
                        entity_scope='school', mode='higher', low=None, high=None, target=None, explanation=f"This is already covered by the factor '{best['name']}'. {NOTE}")
        mode = 'higher'
        if re.search(r'\b(below|under|less than|short of)\b.*\b(target|norm|\d+)', low): mode = 'below_target'
        elif re.search(r'\b(fewer|less|lack|shortage|low|lower|no)\b', low): mode = 'lower'
        if re.search(r'\b(whether|yes|has no|does not have|without)\b', low): mode = 'yes'
        nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', low)]
        key = fk or '_'.join(w for w in re.findall(r'[a-z]+', low) if w not in {'the', 'a', 'of', 'more', 'less', 'should', 'be', 'higher', 'priority', 'schools', 'school',
                                                                                     'with', 'number', 'rank', 'by', 'give', 'get', 'fewer', 'many', 'lot', 'lots'})[:40] or 'custom_value'
        label = known[fk]['label'] if fk else desc.strip().rstrip('.').capitalize()[:60]
        return dict(existing_code=None, name=label[:60], description=desc.strip(), fact_key=key, fact_label=label[:60], unit=None, entity_scope='school', mode=mode,
                    low=0 if mode in ('higher', 'lower') else None, high=(max(nums) if nums else 100) if mode in ('higher', 'lower') else None,
                    target=(nums[0] if nums else None) if mode in ('below_target', 'above_target') else None,
                    explanation=f'Each school gets a number for "{label}"; {"more" if mode == "higher" else "less" if mode == "lower" else "a yes" if mode == "yes" else "being further below the target"} means a visit sooner. Check the numbers before saving. {NOTE}')

    # ------------------------------------------------------------------
    def visit_brief(self, i):
        sc = i.get('scores') or {}
        focus = [f"{x['label']}: {x['explanation']}" for x in sorted(sc.get('categories', []), key=lambda x: -(x.get('contribution') or 0))[:3] if x.get('contribution')]
        issues = i.get('open_issues', [])
        ask = [f"Last time we agreed: {a['action']} (due {a['due']}). How has it gone?" for a in i.get('open_actions', [])[:3]]
        if not ask and issues: ask = [f"How are things now with {re.sub(r'^\[O\d+\] ', '', issues[0]['issue'])}?"]
        check = [f"Look for progress on: {re.sub(r'^\[O\d+\] ', '', o['issue'])}" for o in issues[:3]] or ['How many students answer questions, and who?', 'Does the teacher check understanding before moving on?']
        last = i.get('last_visit')
        summary = (f"{i.get('who')}: priority score {sc.get('score') if sc.get('score') is not None else 'not ranked yet'} ({sc.get('band') or 'no band'}). "
                   f"{len(issues)} open issue(s), {len(i.get('overdue', []))} overdue follow-up(s). "
                   + (f"Last visit on {last}." if last else 'No earlier visit on record.') + ' ' + NOTE)
        return dict(summary=summary, focus_points=focus or ['Not enough records yet: use this visit to collect a first picture.'], ask_teacher=ask or
                    ['What is going well in this class?', 'Where do students struggle most?'], check_in_class=check)

    def student_questions(self, i):
        topic = i.get('topic') or 'today\'s lesson'
        qs = [dict(question=f'What did you learn today about {topic}? Tell me one thing.', level='recall', good_answer=f'Names a correct fact or word from the lesson on {topic}.',
                   watch_for='Repeats the title only, or says nothing specific.', ask_who='A student from the back row'),
              dict(question=f'Can you explain {topic} in your own words, as if to a younger child?', level='understand', good_answer='Explains the main idea correctly in their own words.',
                   watch_for='Memorised sentence from the book without understanding.', ask_who='A student who did not raise a hand'),
              dict(question=f'Give me an example of {topic} from your home or village.', level='apply', good_answer='A correct new example from daily life.',
                   watch_for='Repeats the textbook example.', ask_who='A girl from the middle rows'),
              dict(question=f'How do you know your answer is right? What would change if…? (ask about {topic})', level='reason', good_answer='Gives a reason or checks the answer.',
                   watch_for='"Because teacher said so".', ask_who='A confident student')]
        if (i.get('class_no') or 9) <= 5:
            qs.append(dict(question='Please read this line from your book and tell me what it means.', level='foundational', good_answer='Reads fluently and explains the meaning.',
                           watch_for='Reads letter by letter or cannot say what it means.', ask_who='Any student; try two different ones'))
        return dict(questions=qs, tips=['Ask different students, not only volunteers.', 'Wait 3-5 seconds after asking.', 'Record answers without names (Student A, B…).', NOTE])

    def evaluate_lesson(self, i):
        tr = i.get('lesson_transcript') or ''
        qmarks = tr.count('?'); words = len(tr.split())
        answers = i.get('student_answers', [])
        given = [a for a in answers if (a.get('answer') or '').strip()]
        per_q = []
        for a in answers:
            exp = set(re.findall(r'[a-z]{4,}', (a.get('good_answer') or '').lower())); got = set(re.findall(r'[a-z]{4,}', (a.get('answer') or '').lower()))
            ov = len(exp & got) / max(1, len(exp))
            per_q.append(dict(question=a.get('question', ''), verdict='no answer' if not got else 'close to expected' if ov >= 0.4 else 'different from expected',
                              note=f'{int(ov * 100)}% word overlap with the expected answer (rough check)'))
        before = [dict(issue=o['issue'], change='not_seen', evidence='Rule-based check cannot judge this; compare in class.') for o in i.get('open_issues', [])[:4]]
        overall = (f"Recorded lesson of about {words} words with {qmarks} questions. {len(given)} of {len(answers)} student answers were recorded. "
                   f"This is a basic rule-based summary; the CRP notes are the main evidence. {NOTE}")
        rubric = [dict(element='B2 Checks for understanding', score=None, evidence=f'{qmarks} questions in the transcript' if tr else 'No transcript')]
        notes = (i.get('crp_notes') or '').strip()
        return dict(overall=overall, rubric=rubric, strengths=[dict(point='CRP observation notes', evidence=notes[:300])] if notes else [],
                    growth=[], students=dict(summary=f'{len(given)} answers recorded.', per_question=per_q, misconceptions=[]),
                    compared_with_before=before, next_steps=[dict(action='Discuss the CRP notes with the teacher and agree one practice to try', who='CRP and teacher', due_in_days=14)],
                    confidence='low', confidence_reason='No AI was used; only simple counts.', safety_flag=None)

    # ------------------------------------------------------------------
    def find_textbooks(self, i):
        board = (i.get('board') or '').lower(); cls = i.get('class_no'); subj = i.get('subject') or ''
        res = []
        if 'state' in board or 'ssc' in board or 'maharashtra' in board:
            res.append(dict(title=f'Balbharati e-books (Maharashtra State Board){" - Class " + str(cls) if cls else ""}', url='https://books.ebalbharati.in/',
                            publisher='Maharashtra State Bureau of Textbook Production (Balbharati)', is_pdf=False, class_no=cls, subject=subj or None, language=i.get('language')))
        res.append(dict(title=f'NCERT textbooks{" - Class " + str(cls) if cls else ""}{" " + subj if subj else ""}', url='https://ncert.nic.in/textbook.php',
                        publisher='NCERT', is_pdf=False, class_no=cls, subject=subj or None, language=None))
        res.append(dict(title='DIKSHA (textbooks with QR-linked lessons, all boards)', url='https://diksha.gov.in/explore', publisher='Ministry of Education',
                        is_pdf=False, class_no=cls, subject=subj or None, language=None))
        res.append(dict(title='ePathshala (NCERT e-books and audio)', url='https://epathshala.nic.in/', publisher='NCERT / CIET', is_pdf=False, class_no=cls,
                        subject=subj or None, language=None))
        return dict(results=res)

    def ask_copilot(self, i):
        q = set(w for w in re.findall(r'[a-z0-9]{3,}', i['question'].lower()) if w not in {'what', 'which', 'the', 'how', 'many', 'does', 'are', 'for', 'with', 'about', 'show'})
        lines = [l for l in i['records'].splitlines() if l.strip()]
        scored = sorted(((sum(1 for w in q if w in l.lower()), l) for l in lines), reverse=True)
        hits = [l for s, l in scored if s > 0][:8]
        ans = ('These records match your question:\n- ' + '\n- '.join(hits)) if hits else 'No records matched your question.'
        return dict(answer=ans + '\n\n' + NOTE, records_used=hits[:5])
