"""Hand-written teaching ideas for the visit report. Plain words, cheap things (pencils, chalk, stones, rope, the school yard), no AI.
Each idea says what is needed, what to do in 3 steps and why it works. The report picks the ones that fit the visit
(what needs to improve, the subject, the class) so every teacher gets ideas that match their lesson."""

# kind: board | hands | outdoor | talk | group     needs: need codes from the visit and teaching-practice names (see report.PRACTICE)
IDEAS = [
    dict(id='board_plan', kind='board', title='Plan your blackboard in three parts', needs={'LESSON_PLANNING', 'B1 Lesson facilitation', 'Time on task', 'WRITING_SKILLS'}, subjects=set(),
         things='Chalk and the blackboard (a duster to keep it tidy).',
         steps=['Before class, divide the board into three: left = what we learn today, middle = one worked example, right = questions for students to try.',
                'Do the middle part slowly. Say each step aloud as you write it, and leave the example on the board.',
                'Let students come and write their own try on the right side. Wipe only that part and repeat with a new question.'],
         why='Showing one clear example, then practice, is one of the best-proven ways to teach (Rosenshine 2012). A planned board also saves time and keeps every child looking at the same thing.'),
    dict(id='slates', kind='talk', title='Everybody answers at the same time', needs={'B2 Checks for understanding', 'CLASS_PARTICIPATION', 'B3 Feedback'}, subjects=set(),
         things='Slates, notebooks or just fingers. Nothing to buy.',
         steps=['Ask a short question. Say "think first" and count slowly to five in your head.',
                'On your signal, every child shows the answer on a slate, in a notebook page held up, or with fingers (1, 2, 3 or 4 for choices).',
                'Look around the room. If many answers are wrong, teach it again in a new way before you go on.'],
         why='When every child must answer, you learn what the whole class knows, not only the front row (Black and Wiliam 1998). Waiting a few seconds also gives better answers (Rowe 1986).'),
    dict(id='think_pair', kind='talk', title='Turn and talk to your neighbour', needs={'CLASS_PARTICIPATION', 'B4 Critical thinking', 'C3 Social and collaborative skills', 'ENGLISH_SPEAKING'}, subjects=set(),
         things='Only the children sitting next to each other.',
         steps=['Ask one "why" or "how" question and write it on the board.',
                'Give one minute: each child tells the neighbour their answer. Walk around and listen.',
                'Ask three pairs to share. Choose pairs from the back rows and quiet corners too.'],
         why='Talking about an idea makes children think it through, and shy children speak more easily to one friend than to the whole class (Great Teaching Toolkit, Coe et al. 2020).'),
    dict(id='pencil_shapes', kind='hands', title='Build it with pencils and sticks', needs={'NUMERACY_BASIC', 'TLM_USAGE', 'B4 Critical thinking'}, subjects={'mathematics', 'maths', 'math'},
         things='Pencils, ice-cream sticks or broken chalk pieces, a bit of thread.',
         steps=['Give each group of four a few pencils. Ask them to make a triangle, a square, a right angle (like the corner of the notebook).',
                'Let them measure the sides with a hand-span or a ruler, and write the numbers on a slate.',
                'Ask: what do you notice? Let them say it in their own words before you give the rule.'],
         why='Children understand an idea best when they first touch real things, then see a picture, and only then see the rule and the symbols (Bruner 1966). Skipping the first step is why many children only memorise.'),
    dict(id='caps_bundles', kind='hands', title='Bottle caps and bundles of ten', needs={'NUMERACY_BASIC', 'TLM_USAGE'}, subjects={'mathematics', 'maths', 'math'},
         things='Bottle caps, small stones or seeds, ice-cream sticks and rubber bands.',
         steps=['Let children count out 10 caps and tie 10 sticks into one bundle. Say "one bundle is ten".',
                'Show 23 as 2 bundles and 3 single sticks. Ask a child to show 41, then 38.',
                'Write the number on the board next to the sticks. Next day, do addition and subtraction by joining and splitting bundles.'],
         why='Place value is the base of all later arithmetic. Children who handle bundles first understand carrying and borrowing, instead of learning them as tricks.'),
    dict(id='fold_fractions', kind='hands', title='Fractions with folded paper and a roti', needs={'NUMERACY_BASIC', 'TLM_USAGE', 'B4 Critical thinking'}, subjects={'mathematics', 'maths', 'math'},
         things='Old newspaper or notebook pages. A roti or a lemon-sized ball of clay if you like.',
         steps=['Give each child a strip of paper. Fold it in two, then in four. Colour one part and ask: what part of the strip is coloured?',
                'Ask two children to share a roti fairly between 2, then between 4. Draw it on the board.',
                'Now compare: which is bigger, one half or one quarter? Let them check by laying the strips on top of each other.'],
         why='Fractions are hard when they are only numbers on the board. Folding and sharing let children see why a half is bigger than a quarter (Teaching at the Right Level, Banerjee et al. 2016, uses the same hands-on style).'),
    dict(id='yard_measure', kind='outdoor', title='Take the class outside: measure the school yard', needs={'NUMERACY_BASIC', 'TLM_USAGE', 'C1 Autonomy', 'CLASS_PARTICIPATION'}, subjects={'mathematics', 'maths', 'math', 'evs', 'science'},
         things='A long rope or string, chalk to mark the ground, a notebook per group.',
         steps=['Take the class out for 15 minutes. Groups of five measure the length and width of the yard with a rope or with their own steps.',
                'Back in class, each group writes its numbers on the board. Ask: why are the numbers different? What is a fair way to measure?',
                'Use the numbers for the day\'s sums: perimeter, area, or simply bigger and smaller.'],
         why='Moving and doing keeps children alert, and a real task gives the sums a purpose. Children also remember what they did with their own hands for much longer.'),
    dict(id='rope_345', kind='outdoor', title='Make a right angle with a knotted rope', needs={'NUMERACY_BASIC', 'TLM_USAGE', 'B4 Critical thinking'}, subjects={'mathematics', 'maths', 'math'},
         things='A rope with 12 equal parts marked by knots. Chalk. Four children per rope.',
         steps=['Three children hold the knots so that one side has 3 parts, one side 4 parts and one side 5 parts. Pull it tight.',
                'Check the corner with the corner of a notebook. It is a right angle. Mark it on the ground with chalk.',
                'Try 4, 5, 6. Is it still a right angle? Let the group decide, then check with the board.'],
         why='Builders have used this rope trick for thousands of years. Children discover the rule themselves, so they remember it and can explain it.'),
    dict(id='picture_talk', kind='talk', title='Picture talk before reading', needs={'FLN_READING', 'ENGLISH_SPEAKING', 'WRITING_SKILLS', 'B1 Lesson facilitation'}, subjects={'english', 'marathi', 'hindi', 'urdu', 'gujarati', 'kannada', 'telugu', 'tamil', 'bengali', 'odia', 'malayalam'},
         things='The picture in the textbook, or a picture you draw on the board.',
         steps=['Before the story, ask: what do you see? What do you think will happen? Let 5 or 6 children speak, in their home language if needed.',
                'Write 3 or 4 words from their answers on the board. Read them together, pointing with the chalk.',
                'Now read the story. Stop twice and ask: what will happen next? Why do you think so?'],
         why='Children read with understanding when they already know the ideas and the words in the text. Reading with understanding is the main goal of NIPUN Bharat (Ministry of Education 2021).'),
    dict(id='word_wall', kind='board', title='A word wall with chalk and a corner of the board', needs={'FLN_READING', 'WRITING_SKILLS', 'ENGLISH_SPEAKING', 'TLM_USAGE'}, subjects={'english', 'marathi', 'hindi', 'urdu', 'gujarati', 'kannada', 'telugu', 'tamil', 'bengali', 'odia', 'malayalam'},
         things='One corner of the board that is never wiped, or a chart paper on the wall.',
         steps=['Each day add 3 new words from the lesson. Draw a tiny picture next to each word.',
                'Start the class by reading the words aloud together. Then play: "I am thinking of a word that starts with... and has a picture of a..."',
                'Ask children to use one word in a sentence about their home or village. Write the best sentence on the board.'],
         why='Seeing the same words again and again, and using them in speech, is how children build a reading vocabulary (Dunlosky et al. 2013 on spaced practice).'),
    dict(id='story_circle', kind='group', title='Story circle and reading corner', needs={'FLN_READING', 'ENGLISH_SPEAKING', 'C3 Social and collaborative skills'}, subjects={'english', 'marathi', 'hindi', 'urdu', 'gujarati', 'kannada', 'telugu', 'tamil', 'bengali', 'odia', 'malayalam'},
         things='Any 5 to 10 story books, or old magazines. A mat or a clean corner.',
         steps=['Keep a small box of books in one corner. Ten minutes before the end of the period, children read in pairs. Stronger readers help weaker ones.',
                'Once a week, sit in a circle. One child tells a story in 5 sentences and the next adds a sentence.',
                'Note down the children who still cannot read a short line. These are the ones to sit with next week.'],
         why='Children who read a little every day improve fastest. Pair reading uses the whole class as teachers (Teaching at the Right Level, Banerjee et al. 2016).'),
    dict(id='nature_walk', kind='outdoor', title='A ten-minute nature walk', needs={'SCIENCE_PRACTICALS', 'TLM_USAGE', 'C1 Autonomy', 'CLASS_PARTICIPATION'}, subjects={'evs', 'science', 'environmental studies', 'social science'},
         things='Nothing: leaves, stones, insects and water are already outside.',
         steps=['Give each group one question: find 5 different leaves, or 3 things that float, or 3 signs that show the season.',
                'Back in class, sort what they found on the floor or the board. Ask: how did you decide which goes together?',
                'Draw the best leaf on the board with its parts named. Children copy it and add one thing they noticed.'],
         why='Science starts with looking carefully and asking why. Children who observe first ask better questions and remember the lesson longer.'),
    dict(id='right_level', kind='group', title='Group children by what they can do today', needs={'MULTIGRADE_MGMT', 'FLN_READING', 'NUMERACY_BASIC', 'B1 Lesson facilitation', 'B3 Feedback'}, subjects=set(),
         things='Five minutes, a few easy and harder questions on the board.',
         steps=['Start the week with 3 quick questions of rising difficulty. See who gets all, some, or none.',
                'For 15 minutes, work in three groups: those who need the basics, those on track, those ready for more. Give each group a different task.',
                'Move children up as soon as they are ready. Do not wait for a test.'],
         why='In many Indian schools, children in one class are at very different levels. Teaching each group at its own level raised reading and maths learning a lot in large studies (Banerjee et al. 2016).'),
    dict(id='child_teacher', kind='group', title='Let a child explain at the board', needs={'C1 Autonomy', 'C2 Perseverance', 'B4 Critical thinking', 'CLASS_PARTICIPATION'}, subjects=set(),
         things='The board and a piece of chalk for the "little teacher".',
         steps=['After you do one example, ask a volunteer (and a child who never volunteers) to do the next one at the board, speaking aloud.',
                'Ask the class to check: is each step right? Let them stop the child and ask a question.',
                'Thank the child for trying, whatever the result. Fix any mistake together.'],
         why='Explaining to others is one of the best ways to learn something (Great Teaching Toolkit, Coe et al. 2020). It also builds courage and a habit of not giving up.'),
    dict(id='mistake_wall', kind='talk', title='Mistakes are welcome here', needs={'A1 Supportive learning environment', 'C2 Perseverance', 'B3 Feedback'}, subjects=set(),
         things='A corner of the board or a chart: "Our good mistakes".',
         steps=['When a child gives a wrong answer, say "thank you, that helps us". Write the idea on the corner of the board.',
                'Ask: what could be the thought behind this answer? Let the class find where it went wrong.',
                'At the end of the week, read the "good mistakes" aloud and ask who can now explain each one.'],
         why='Children who see mistakes as part of learning try harder and give up less (Dweck 2006). Feedback that says what to do next works better than a mark (Education Endowment Foundation 2021).'),
    dict(id='feedback_words', kind='talk', title='Say what was good and what to do next', needs={'B3 Feedback', 'A2 Positive behavioural expectations', 'A1 Supportive learning environment'}, subjects=set(),
         things='Your voice and a few ready sentences.',
         steps=['Instead of "good" or "wrong", say what exactly: "You drew the right angle correctly. Now check the longest side."',
                'Praise the effort and the method: "You tried a second way, I like that."',
                'Give the child a small next step and a chance to try again right away.'],
         why='Feedback is among the most useful things a teacher can give, when it is specific and tells the child what to do next (Education Endowment Foundation 2021; Hattie and Timperley 2007).'),
    dict(id='attendance_chart', kind='board', title='A class attendance chart that children keep', needs={'ATTENDANCE_IRREGULAR', 'A2 Positive behavioural expectations', 'A1 Supportive learning environment'}, subjects=set(),
         things='Chart paper or a drawn grid on the side of the board, chalk.',
         steps=['Draw the weeks across and the children\'s names down. Let a monitor tick the days present each morning.',
                'Every Friday, say aloud which group had the best week. Do not shame any child.',
                'Visit the home or send a word with a neighbour when a child misses three days in a row.'],
         why='Children learn only when they are in school. A visible chart makes the class care about each other\'s attendance.'),
]


# words in the lesson topic that make an idea a good fit
TOPIC_WORDS = {
    'rope_345': ('pythag', 'triangle', 'right angle', 'right-angle', 'geometry'), 'pencil_shapes': ('triangle', 'shape', 'geometry', 'angle', 'pythag', 'square', 'polygon'),
    'caps_bundles': ('place value', 'addition', 'subtraction', 'number', 'counting', 'tens'), 'fold_fractions': ('fraction', 'half', 'quarter', 'decimal'),
    'yard_measure': ('measure', 'area', 'perimeter', 'length', 'distance', 'data'), 'picture_talk': ('story', 'poem', 'reading', 'comprehension', 'passage'),
    'nature_walk': ('plant', 'leaf', 'leaves', 'water', 'animal', 'season', 'soil', 'weather', 'insect', 'tree'),
}


def pick(growth, low_elements, subject, class_no, limit=6, topic=None):
    """The ideas that fit this visit best: what needs to improve first, then the subject, then good all-round ones.
    Always includes one blackboard-and-chalk idea and one hands-on or outdoor idea."""
    needs = {g.get('need_code') for g in growth if g.get('need_code')} | set(low_elements)
    subj = (subject or '').strip().lower()
    top = (topic or '').lower()
    scored = []
    for i in IDEAS:
        score = (5 if top and any(k in top for k in TOPIC_WORDS.get(i['id'], ())) else 0) + 3 * len(i['needs'] & needs) + (2 if subj and subj in i['subjects'] else 0) + (0 if i['subjects'] and subj not in i['subjects'] else 1)
        if i['subjects'] and subj not in i['subjects']: score -= 3                  # a maths idea is not shown for an English lesson
        scored.append((score, i))
    scored.sort(key=lambda t: -t[0])
    out = [i for s, i in scored if s > 0][:limit]
    for kind_group in ({'board'}, {'hands', 'outdoor'}):
        if not any(i['kind'] in kind_group for i in out):
            extra = next((i for s, i in scored if i['kind'] in kind_group and (not i['subjects'] or subj in i['subjects'])), None)
            if extra: out = out[:limit - 1] + [extra]
    return out


STAGE = [
    (3, 'Classes 1 to 3 (about 6 to 8 years)', 'Children learn by touching, moving, singing and talking. Keep each activity short (5 to 8 minutes), use real things in every lesson, and let them speak in the home language.'),
    (5, 'Classes 4 and 5 (about 9 to 10 years)', 'Children can follow steps when they first see a real example. Link new ideas to the home and the village. Ask them to explain how they got an answer, not only the answer.'),
    (8, 'Classes 6 to 8 (about 11 to 13 years)', 'Children begin to use letters and rules (like a and b) but only when they have first worked with real things. Move slowly from objects, to a drawing, to the rule.'),
    (10, 'Classes 9 and 10 (about 14 to 15 years)', 'Students can reason about ideas, but still need worked examples before problems. Ask "why" and "what if", and let them teach each other.'),
]


def stage_for(class_no):
    try: c = int(class_no)
    except (TypeError, ValueError): return None
    return next(((n, t) for lim, n, t in STAGE if c <= lim), None)


# (plain headline, what it means in class, who found it)
RESEARCH = [
    ('Check what every child knows, often', 'Short questions to the whole class show you who is lost, while you can still help.', 'Black and Wiliam 1998; Wiliam 2011'),
    ('Teach in small steps and practise each step', 'Show one small idea, let children try, then add the next. Do not pour in too much at once.', 'Rosenshine 2012; Sweller (cognitive load) 2017'),
    ('Real things first, rules after', 'Let children touch and see before they meet symbols and rules.', 'Bruner 1966'),
    ('Wait a few seconds after you ask', 'Three to five seconds of silence give longer, better answers from more children.', 'Rowe 1986'),
    ('Tell children what to do next', 'Specific feedback helps far more than "good" or a mark.', 'Hattie and Timperley 2007; Education Endowment Foundation 2021'),
    ('Teach at the level the child is at', 'Group children by what they can do today, not by their class number.', 'Banerjee and others 2016 (Teaching at the Right Level, India)'),
    ('Spread practice over many days', 'A little practice every day beats one long session. Quick quizzes help children remember.', 'Dunlosky and others 2013'),
    ('One or two clear next steps beat a long list', 'A mentor who gives a few clear steps and returns to check gets the biggest change.', 'Kraft, Blazar and Hogan 2018'),
]
