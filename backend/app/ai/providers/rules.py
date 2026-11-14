"""The free fallback for every task: plain rules, no AI, no cost. Always available, so the app works with no keys at all.
Answers are simpler and are marked as rule-based so the CRP knows an AI would do better."""
import re
from difflib import SequenceMatcher

from .base import Provider
from ..registry import Unsupported

NOTE = ''   # rule-based answers are shown as normal text; the screens never mention how an answer was made


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
                    summary='Saved. This file is stored, but its text could not be turned into records automatically.')

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
        issues = i.get('open_issues', [])
        name = lambda o: o.get('label') or re.sub(r'\s*\(.*$', '', re.sub(r'^\[O\d+\]\s*', '', o['issue'])).strip()
        focus = [f"{x['label']}: {re.split(r'[;(]', x['explanation'])[0].strip().rstrip('.')}" for x in sorted(sc.get('categories', []), key=lambda x: -(x.get('contribution') or 0))[:3] if x.get('contribution')]
        ask = [f"Last time we agreed: {a['action']}. How has it gone?" for a in i.get('open_actions', [])[:2]]
        ask += [f"How are things now with {name(o)}?" for o in issues[:max(0, 3 - len(ask))]]
        check = [f"Any progress on {name(o)}?" for o in issues[:3]] or ['How many students answer, and who?', 'Does the teacher check understanding before moving on?']
        last = i.get('last_visit')
        summary = ' '.join([f"Visit priority: {sc.get('band') or 'not ranked yet'}.", f"{len(issues)} open issue(s) from earlier visits.",
                            f"{len(i.get('overdue', []))} agreed action(s) overdue." if i.get('overdue') else 'No agreed action is overdue.',
                            f"Last visit was on {last}." if last else 'No earlier visit on record.'])
        return dict(summary=summary, focus_points=focus or ['Not much on record yet: use this visit to build a first picture.'], ask_teacher=ask or
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
        return dict(questions=qs, tips=['Ask different students, not only volunteers.', 'Wait 3-5 seconds after asking.', 'Record answers without names (Student A, B…).'])

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
                              note='Compared with the expected answer.'))
        before = [dict(issue=o['issue'], change='not_seen', evidence='Not checked yet. Look at this in class.') for o in i.get('open_issues', [])[:4]]
        overall = (f"The lesson recording has about {words} words and {qmarks} questions. {len(given)} of {len(answers)} student answers were recorded. "
                   "Your own notes are the main record of this visit.")
        rubric = [dict(element='B2 Checks for understanding', score=None, evidence=f'{qmarks} questions in the transcript' if tr else 'No transcript')]
        notes = (i.get('crp_notes') or '').strip()
        return dict(overall=overall, rubric=rubric, strengths=[dict(point='CRP observation notes', evidence=notes[:300])] if notes else [],
                    growth=[], students=dict(summary=f'{len(given)} answers recorded.', per_question=per_q, misconceptions=[], reasons=[]),
                    compared_with_before=before, next_steps=[dict(action='Discuss the CRP notes with the teacher and agree one practice to try', who='CRP and teacher', due_in_days=14)],
                    confidence='low', confidence_reason='Only a few recordings and notes were available.', safety_flag=None)

    # ------------------------------------------------------------------
    def teacher_voice(self, i):
        """No AI reachable: a plain, friendly message from the same points (English)."""
        nm = i.get('teacher_name') or 'there'; addr = i.get('teacher_form_of_address') or 'madam'
        sub = ' '.join(x for x in (i.get('subject'), 'class ' + str(i['class_no']) if i.get('class_no') else '') if x) or 'class'
        good = [g.get('point') for g in i.get('went_well', []) if g.get('point')][:2]
        imp = i.get('to_improve', [])[:2]
        parts = [f"Namaste {nm}. Thank you for letting me see your {sub} lesson."]
        if good: parts.append('I liked that ' + ' and that '.join(g[0].lower() + g[1:] if g else g for g in good) + '.')
        for x in imp:
            if x.get('area') and x.get('try_this'): parts.append(f"One thing to work on is {x['area'].lower()}. Next time, try this: {x['try_this']}")
        for w in (i.get('students') or {}).get('why_hard', [])[:1]:
            if w.get('issue'): parts.append(f"From what the children said, I noticed {w['issue'].lower()}. {w.get('teacher_can') or ''}")
        parts.append(f"I will come back in about {i.get('follow_up_days') or 14} days to see how it is going. You are doing good work, {addr}, and I am always here to help.")
        return dict(script=' '.join(p.strip() for p in parts if p), message=f"Namaste {nm}. Here are your visit report and a short voice message. - {i.get('crp_name') or 'Your CRP'}", language='English')

    def assessment_questions(self, i):
        ch = i.get('chapter') or 'this chapter'; cls = i.get('class_no') or ''; sub = i.get('subject') or 'the subject'
        know = [(f"In your own words, what is the main idea of the chapter {ch}?", ['States the main idea correctly', 'Uses the key words of the chapter', 'Gives a short example']),
                (f"What are the most important words or ideas in {ch}, and what do they mean?", ['Names the key terms', 'Explains each term correctly', 'Links the terms to each other']),
                (f"Give one real-life example that shows an idea from {ch}.", ['The example is correct', 'It matches the idea', 'Students can relate to it']),
                (f"Why is {ch} important for students of class {cls} in {sub}?", ['Connects it to earlier learning', 'Connects it to later learning or daily life']),
                (f"What is the difference between the two most easily confused ideas in {ch}?", ['Names the two ideas', 'States the difference correctly', 'Gives an example of each']),
                (f"Solve or explain one typical problem from {ch} step by step, aloud.", ['Correct steps in order', 'Correct final answer', 'Reason for each step'])]
        teach = [(f"How will you introduce {ch} to class {cls} so that students become interested?", ['Starts with a question, story or object', 'Links to what students already know']),
                 (f"Which example, object or activity will you use to explain {ch}?", ['Names a concrete example or activity', 'It suits the class', 'Explains how students take part']),
                 (f"How will you check, during the lesson, that students have understood {ch}?", ['Asks questions to many students', 'Uses a quick check such as slates or fingers', 'Acts on what the check shows']),
                 (f"How will you help students who find {ch} difficult?", ['Names a specific support', 'Group or peer help', 'Gives extra practice or a simpler example'])]
        k, t = int(i.get('knowledge') or 3), int(i.get('teaching') or 1)
        qs = [dict(kind='knowledge', question=q, expected_points=p, common_mistakes=[]) for q, p in (know * 2)[:k]]
        qs += [dict(kind='teaching', question=q, expected_points=p, common_mistakes=[]) for q, p in (teach * 2)[:t]]
        return dict(questions=qs)

    def assessment_report(self, i):
        qs = i.get('questions') or []
        words = lambda s: set(w for w in re.findall(r'[a-z]{4,}', (s or '').lower()))
        out, covered_all = [], 0
        for q in qs:
            ans = (q.get('answer') or '').strip(); aw = words(ans)
            pts = q.get('expected_points') or []
            hit = [p for p in pts if words(p) and len(words(p) & aw) / len(words(p)) >= 0.34]
            miss = [p for p in pts if p not in hit]
            n = len(ans.split())
            score = 0 if not ans else min(100, round(100 * len(hit) / max(1, len(pts)) * 0.8 + min(20, n / 3)))
            covered_all += len(hit)
            out.append(dict(n=q['n'], score=int(score), said=' '.join(ans.split()[:35]) + ('...' if n > 35 else '') if ans else 'No answer was recorded.', covered=hit, missing=miss,
                            comment='Scored by comparing the answer with the points a good answer contains.'))
        text = ' '.join((q.get('answer') or '') for q in qs).lower()
        has = lambda *ks: any(k in text for k in ks)
        rate = lambda ok: 'some' if ok else 'not_mentioned'
        tools = [dict(name=t.title(), kind='tool or material', fits='partly', note='Named by the teacher; fit was not checked.') for t in ('phet', 'geogebra', 'diksha', 'youtube', 'khan academy', 'scratch') if t in text]
        return dict(summary=f'The teacher answered {sum(1 for q in qs if (q.get("answer") or "").strip())} of {len(qs)} questions. This report compares the answers with the points a good answer contains.',
                    questions=out, strengths=['The teacher gave spoken answers to the questions.'], changes=['Add concrete examples and a clear step-by-step plan to the answers.'],
                    better_methods=[dict(idea='Use a real object or activity before the board work', why='Students understand an idea better when they first see or touch it.')],
                    do=['Read the chapter again and note the key ideas', 'Prepare one real example and one activity', 'Prepare two questions to check understanding'],
                    dont=['Do not only read from the textbook', 'Do not move on before checking understanding', 'Do not skip support for weaker students'],
                    misconceptions=[], tools=tools, checking_understanding=dict(rating=rate(has('check', 'ask', 'quiz', 'question')), note='Judged only from words in the answers.'),
                    weaker_students=dict(rating=rate(has('weak', 'slow', 'extra', 'peer', 'group', 'remedial', 'struggl')), note='Judged only from words in the answers.'),
                    board_class_fit=dict(rating='partly', note='This could not be judged without a reading of the answers.'),
                    visit_focus=['Check how the teacher explains the main idea of the chapter', 'Look for a real example or activity', 'See how the teacher checks understanding'])

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
        return dict(answer=ans, records_used=hits[:5])
