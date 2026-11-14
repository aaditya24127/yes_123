"""Makes the classroom test recordings in `real_voices/`: five long lessons (30-40 minutes each) with a teacher and four students.

IMPORTANT, honest description: these are NOT recordings of real people. The words are written by Claude as realistic classroom dialogue (teacher questions, short or wrong
student answers, corrections, doubts, small interruptions) and spoken by free Indian-accent *neural text-to-speech* voices (edge-tts: en-IN, hi-IN, mr-IN). Children's voices are
the adult voices raised in pitch. Pauses and a little room noise are added so that the file behaves like a classroom recording for the speech-to-text step. They are test material:
use real recordings (with consent) for a real evaluation. The exact script of every file is kept (`real_voices/scripts/*.json`) so the transcript can be checked word by word.

    backend\\.venv\\Scripts\\python.exe tools/make_real_voices.py script [lesson-id ...]     (Claude writes the dialogue; a few cents of AI credit)
    backend\\.venv\\Scripts\\python.exe tools/make_real_voices.py audio  [lesson-id ...]     (voices + mixing; free)
    backend\\.venv\\Scripts\\python.exe tools/make_real_voices.py all                         (both, all five lessons)

File names: <chapter>_<standard>_<board>_<topic>.mp3
"""
import asyncio, hashlib, json, os, random, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..'))
OUT = os.path.join(ROOT, 'real_voices'); WORK = os.path.join(OUT, '_work'); SCRIPTS = os.path.join(OUT, 'scripts')
for d in (OUT, WORK, SCRIPTS): os.makedirs(d, exist_ok=True)

# ---- the five lessons: id, file name, what it is, language, voices, and the phases of the lesson (each phase = about `w` words of dialogue)
STUDENTS = {  # code -> (name, gender)
    'en': {'S1': ('Ananya', 'girl'), 'S2': ('Rohan', 'boy'), 'S3': ('Sneha', 'girl'), 'S4': ('Aditya', 'boy')},
    'hi': {'S1': ('Anjali', 'girl'), 'S2': ('Rahul', 'boy'), 'S3': ('Priya', 'girl'), 'S4': ('Aman', 'boy')},
    'mr': {'S1': ('Sakshi', 'girl'), 'S2': ('Omkar', 'boy'), 'S3': ('Pooja', 'girl'), 'S4': ('Shubham', 'boy')},
}
LESSONS = [
    dict(id='L1', file='baudhayana-pythagoras-theorem_8_cbse_area-proof-and-triples', board='CBSE', std=8, subject='Mathematics', chapter='The Baudhayana-Pythagoras Theorem', book='Ganita Prakash Part 2',
         topic='proof of the theorem by areas, and Pythagorean triples', lang='en', teacher=('Mrs. Deshpande', 'woman'), kid=0,
         voices=dict(T=('en-IN-NeerjaNeural', '-3%', '+0Hz'), S1=('en-IN-NeerjaExpressiveNeural', '+8%', '+38Hz'), S2=('en-IN-PrabhatNeural', '+6%', '+40Hz'), S3=('en-IN-NeerjaNeural', '+12%', '+48Hz'), S4=('en-IN-PrabhatNeural', '+3%', '+26Hz')),
         language_note='Indian English as spoken in a CBSE school: clear, a few Hindi or Marathi words now and then (achha, haan, bas).',
         phases=[('Settling in and a quick check of the homework on squares and square roots', 480), ('The rope with knots at 3, 4 and 5 units: students make a right angle in groups', 520),
                 ('Discovery with unit squares on the three sides of a 3-4-5 and a 6-8-10 triangle, a table on the board', 560), ('The statement of the theorem, names hypotenuse and legs, the common mistake of adding the sides', 520),
                 ('Proof by areas: four triangles arranged in a square of side a plus b, step by step, a student gets confused and the teacher explains again', 600), ('Worked example one: hypotenuse of a 5 and 12 triangle, units, square root', 460),
                 ('Worked example two: a ladder against a wall, finding a leg', 460), ('Pythagorean triples: multiples of 3-4-5, 5-12-13, 8-15-17, the pattern 2m, m squared minus 1, m squared plus 1', 560),
                 ('The converse: is 7-24-25 a right triangle, is 6-8-11 one, a weaker student is helped, a small discipline moment', 520), ('Practice in groups, the teacher walks round, groups report, exit questions, homework, closing', 560)]),
    dict(id='L2', file='sajiv-srushti-anukulan-ani-vargikaran_7_ssc-maharashtra_anukulan-adaptation', board='Maharashtra State Board (SSC)', std=7, subject='Science', chapter='सजीव सृष्टि : अनुकूलन व वर्गीकरण', book='Samanya Vigyan Ekatmik (Marathi medium)',
         topic='anukulan (adaptation) of animals and plants to their surroundings', lang='mr', teacher=('Patil sir', 'man'), kid=0,
         voices=dict(T=('mr-IN-ManoharNeural', '-3%', '+0Hz'), S1=('mr-IN-AarohiNeural', '+6%', '+30Hz'), S2=('mr-IN-ManoharNeural', '+6%', '+42Hz'), S3=('mr-IN-AarohiNeural', '+10%', '+44Hz'), S4=('mr-IN-ManoharNeural', '+3%', '+28Hz')),
         language_note='Natural spoken Marathi of a Maharashtra school (Pune region), written in Devanagari. Write English science words (adaptation, vertebrate) in Devanagari letters so a Marathi voice can read them.',
         phases=[('Greeting, a revision question on the last lesson, linking to today: why can a camel not live in water', 430), ('The idea of anukulan with examples from the village: cow, buffalo, owl, frog', 450),
                 ('Desert: camel, cactus, how they save water', 440), ('Water animals: fish gills and fins, the lotus leaf', 440), ('Cold regions: polar bear, penguin, thick fat, a student doubts and the teacher answers', 450),
                 ('Behaviour changes: migration of birds, a student tells about storks seen near the river, sleeping through winter', 440), ('Plants: plants of dry and wet places, leaves and roots', 430),
                 ('Why we classify, with and without a backbone, an activity with pictures', 440), ('Group work: classify twelve animals and plants, groups present, the teacher corrects', 450), ('Recap on the board, homework, student questions, closing', 420)]),
    dict(id='L3', file='cell-the-unit-of-life_9_icse_cell-organelles-plant-vs-animal', board='ICSE', std=9, subject='Science (Biology)', chapter='Cell : The Unit of Life', book='Selina Concise Biology',
         topic='parts of a cell, and how plant and animal cells differ', lang='en', teacher=('Mr. Menon', 'man'), kid=0,
         voices=dict(T=('en-IN-PrabhatNeural', '-3%', '+0Hz'), S1=('en-IN-NeerjaNeural', '+8%', '+36Hz'), S2=('en-IN-PrabhatNeural', '+6%', '+38Hz'), S3=('en-IN-NeerjaExpressiveNeural', '+12%', '+46Hz'), S4=('en-IN-PrabhatNeural', '+3%', '+24Hz')),
         language_note='Indian English of an ICSE school: formal, precise, scientific terms spoken carefully.',
         phases=[('Entering, the cell as a brick of a building, questions on what students think living things are made of', 480), ('A short history: Robert Hooke and cork, Schleiden and Schwann, the cell theory', 520),
                 ('Using a microscope: onion peel slide, what the students saw last week', 500), ('Cell membrane and cell wall, a student asks why plants need a wall', 520), ('Nucleus and chromosomes, the control room analogy', 500),
                 ('Cytoplasm, mitochondria, the powerhouse, a student mixes it up with the chloroplast', 520), ('Endoplasmic reticulum, Golgi bodies, ribosomes, lysosomes in simple words', 540),
                 ('Chloroplast and vacuole, plant cell versus animal cell, a comparison table on the board', 540), ('Common mistakes in drawing and labelling, a student draws on the board and the class corrects it', 480), ('Quick quiz, revision of the chapter, homework, closing', 460)]),
    dict(id='L4', file='working-with-fractions_7_cbse_adding-unlike-fractions-hinglish', board='CBSE', std=7, subject='Mathematics', chapter='Working with Fractions', book='Ganita Prakash Part 1',
         topic='adding and subtracting fractions with different denominators', lang='hi', teacher=('Sharma madam', 'woman'), kid=0,
         voices=dict(T=('hi-IN-SwaraNeural', '-3%', '+0Hz'), S1=('hi-IN-SwaraNeural', '+8%', '+36Hz'), S2=('hi-IN-MadhurNeural', '+6%', '+40Hz'), S3=('hi-IN-SwaraNeural', '+12%', '+48Hz'), S4=('hi-IN-MadhurNeural', '+3%', '+28Hz')),
         language_note='Hinglish as in a real Indian classroom: Hindi sentences in Devanagari, with English maths words (fraction, denominator, numerator, LCM) written in Latin letters, mixed naturally.',
         phases=[('Greeting, revising what a fraction is with a roti and a pizza, numerator and denominator', 450), ('Equivalent fractions with paper strips, students find them', 460),
                 ('Adding fractions with the same denominator, easy examples', 420), ('Why unlike denominators are a problem: one half plus one third, students guess and are wrong', 460), ('Finding the LCM of the denominators, a revision of LCM', 460),
                 ('Worked example: three fourths plus one sixth, step by step', 470), ('Subtraction of unlike fractions, a student makes the mistake of subtracting denominators', 470),
                 ('Word problems: a rope, a water tank, a kheer recipe, a weaker student is helped', 480), ('Mixed numbers, converting and adding', 460), ('Practice, answers checked, homework and closing', 440)]),
    dict(id='L5', file='fair-share_3_cbse_halves-and-quarters', board='CBSE', std=3, subject='Mathematics', chapter='Fair Share', book='Maths Mela',
         topic='sharing equally, halves and quarters with everyday things', lang='en', teacher=('Mrs. Kulkarni', 'woman'), kid=1,
         voices=dict(T=('en-IN-NeerjaExpressiveNeural', '-4%', '+0Hz'), S1=('en-IN-NeerjaNeural', '+10%', '+58Hz'), S2=('en-IN-PrabhatNeural', '+8%', '+62Hz'), S3=('en-IN-NeerjaExpressiveNeural', '+14%', '+66Hz'), S4=('en-IN-PrabhatNeural', '+6%', '+55Hz')),
         language_note='Simple Indian English for eight-year-olds, a few Hindi or Marathi words (chalo, shabash, haan). Short sentences, many children answering in one or two words.',
         phases=[('Entering, a circle of children, a story about two friends and one roti', 440), ('Sharing sweets between two children: fair and not fair', 450), ('Folding paper into two equal parts, the word half', 440),
                 ('Half of a group of things: counters, marbles, bangles', 440), ('Sharing between four, folding again, the word quarter', 450), ('Children share a real fruit (an orange drawn on the board) and say what they see', 440),
                 ('Half and quarter of a chapati, a pizza, a cake, a student says three parts and is helped', 450), ('Making equal groups: twelve pencils for three children, for four children', 450),
                 ('A small game: show a half, show a quarter, children hold up folded papers', 440), ('Practice on the page, tidy up, praise, closing song, homework', 420)]),
]
NAMES = {l['id']: l for l in LESSONS}
MIN_SEC, MAX_SEC = 31 * 60, 39 * 60                                 # a lesson recording must be 30-40 minutes: aim inside this
BOOST = 12                                                          # percent: how much faster than the voice's own pace everybody speaks
PAUSE_SCALE = 0.75
MAX_TEMPO = 1.10                                                    # the largest time-stretch applied to the finished mix
DROP = {'L1': [6, 8, 3], 'L2': [6, 3], 'L3': [8, 3], 'L4': [8, 6], 'L5': [5, 8]}      # parts (0-based) that can be left out, in this order, when a lesson would still be too long


def client():
    import anthropic
    from dotenv import dotenv_values
    return anthropic.Anthropic(api_key=dotenv_values(os.path.join(ROOT, '.env')).get('ANTHROPIC_API_KEY'), max_retries=3, timeout=600)


def prompt(l, i, phase, words, prev_tail, summary):
    stu = STUDENTS[l['lang']]
    people = f"T = the teacher, {l['teacher'][0]} ({l['teacher'][1]}). " + ' '.join(f"{c} = {n} ({g})." for c, (n, g) in stu.items())
    outline = '\n'.join(f"  {k + 1}. {t}" for k, (t, _) in enumerate(l['phases']))
    return (
        f"Write part {i + 1} of {len(l['phases'])} of a transcript of one real classroom lesson. It will be spoken aloud by text-to-speech voices and used to test speech recognition, so it must sound like a real Indian "
        f"school lesson, not like a textbook.\n\nLESSON: Class {l['std']} {l['subject']}, {l['board']}, book {l['book']}, chapter \"{l['chapter']}\", topic: {l['topic']}.\n"
        f"PEOPLE: {people} Only these speakers.\nLANGUAGE: {l['language_note']}\n\nWHOLE LESSON OUTLINE:\n{outline}\n\n"
        f"THIS PART (part {i + 1}): {phase}\nLength: about {words} words of speech in total.\n"
        f"{'Lesson so far (summary): ' + summary if summary else 'This is the start of the lesson.'}\n"
        f"{'The last turns before this part (continue from here, do not repeat them):' + chr(10) + prev_tail if prev_tail else ''}\n\n"
        "RULES\n- The teacher talks most (about 65% of the words), the students answer often: short answers, half answers, wrong answers that the teacher gently corrects, one or two doubts, a joke or small interruption now and then.\n"
        "- Natural speech: fillers (so, okay, see, now, haan, achha), repeating the key point, rhetorical questions, calling students by name, praise, correcting, telling what is being written on the board (\"I am writing on the board...\").\n"
        "- Teacher turns are usually 15-60 words (a few longer explanations up to 90 words); student turns are usually 1-25 words. No two people talk at once.\n"
        "- No stage directions, no brackets, no emojis, no markdown, no digits inside formulas: write what a person would say aloud (\"a squared plus b squared\"). Small numbers may be digits.\n"
        "- Keep the facts correct for the class level. Do not end the lesson before the last part unless this is the last part.\n"
        "- Give each turn a pause after it, in seconds, field p: usually 0.3 to 1.2; after a teacher question 1.0 to 3.0; when the class is working silently on something the teacher has just set, 5 to 10.\n\n"
        'OUTPUT: only a JSON array, no other text. Each item: {"s": "T" or "S1".."S4", "t": "what is said", "p": pause in seconds}. After the array nothing.'
    )


def parse_turns(raw):
    """The JSON array of turns from the answer. Also copes with a code fence around it and with an answer that was cut off in the middle (the finished turns are kept)."""
    raw = re.sub(r'^```(?:json)?|```$', '', raw.strip(), flags=re.M).strip()
    start = raw.index('[')
    try:
        return json.JSONDecoder().raw_decode(raw[start:])[0]
    except json.JSONDecodeError:
        cut = raw.rfind('}', start)
        if cut < 0: raise
        return json.loads(raw[start:cut + 1] + ']')


def write_script(l):
    """Claude writes the dialogue part by part (each part gets the end of the previous part so the lesson flows). Parts are cached."""
    c = client(); d = os.path.join(WORK, l['id']); os.makedirs(d, exist_ok=True)
    parts, tail, summary = [], '', ''
    for i, (phase, words) in enumerate(l['phases']):
        path = os.path.join(d, f'part_{i + 1:02d}.json')
        if os.path.exists(path):
            turns = json.load(open(path, encoding='utf-8'))
        else:
            for attempt in range(3):
                msg = c.messages.create(model='claude-sonnet-5-5', max_tokens=14000, messages=[{'role': 'user', 'content': prompt(l, i, phase, words, tail, summary)}])
                raw = ''.join(b.text for b in msg.content if getattr(b, 'type', '') == 'text')
                try:
                    turns = parse_turns(raw); break
                except Exception:
                    print(l['id'], 'part', i + 1, 'attempt', attempt + 1, 'could not read the answer; stop_reason', msg.stop_reason, 'length', len(raw), repr(raw[:160]), flush=True)
                    if attempt == 2: raise
            turns = [dict(s=t['s'], t=re.sub(r'\s+', ' ', str(t['t'])).strip(), p=float(min(12, max(0.2, t.get('p', 0.8))))) for t in turns if t.get('s') in ('T', 'S1', 'S2', 'S3', 'S4') and str(t.get('t', '')).strip()]
            json.dump(turns, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        parts.append(turns)
        tail = '\n'.join(f"{t['s']}: {t['t']}" for t in turns[-8:]); summary = f"parts 1-{i + 1} done: " + '; '.join(p for p, _ in l['phases'][:i + 1])[-700:]
        print(l['id'], 'part', i + 1, len(turns), 'turns', sum(len(t['t'].split()) for t in turns), 'words', flush=True)
    allt = [t for p in parts for t in p]
    json.dump(dict(lesson={k: v for k, v in l.items() if k not in ('phases', 'voices')}, turns=allt), open(os.path.join(SCRIPTS, l['file'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    return allt


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode: raise RuntimeError(r.stderr[-600:])
    return r.stderr


def duration(path):
    err = subprocess.run([ffmpeg(), '-i', path], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', err)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0


def silence(sec):
    sec = round(max(0.1, sec), 1); p = os.path.join(WORK, f'_sil_{sec}.mp3')
    if not os.path.exists(p): run([ffmpeg(), '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', str(sec), '-c:a', 'libmp3lame', '-b:a', '48k', p])
    return p


async def tts_all(l, turns):
    import edge_tts
    d = os.path.join(WORK, l['id'], 'tts'); os.makedirs(d, exist_ok=True)
    sem = asyncio.Semaphore(6); files = [None] * len(turns)

    async def one(i, t):
        voice, rate, pitch = l['voices'][t['s']]
        rate = f"{int(rate.strip('%')) + BOOST:+d}%"                    # the voices are slow for a classroom: a little faster than their own pace
        key = hashlib.md5(f"{voice}|{rate}|{pitch}|{t['t']}".encode('utf-8')).hexdigest()[:16]; path = os.path.join(d, key + '.mp3')
        if not (os.path.exists(path) and os.path.getsize(path) > 500):
            async with sem:
                for attempt in range(4):
                    try:
                        await edge_tts.Communicate(t['t'], voice, rate=rate, pitch=pitch).save(path); break
                    except Exception:
                        if attempt == 3: raise
                        await asyncio.sleep(2 + attempt * 2)
        files[i] = path
    await asyncio.gather(*[one(i, t) for i, t in enumerate(turns)])
    return files


def load_parts(l):
    d = os.path.join(WORK, l['id'])
    return [json.load(open(os.path.join(d, f'part_{i + 1:02d}.json'), encoding='utf-8')) for i in range(len(l['phases']))]


def make_audio(l):
    """Voices + pauses + room noise -> one mp3. Length is planned from the real length of every spoken turn: if the lesson would be too long, optional parts (DROP) are left
    out first; the rest is fixed by a time-stretch of at most x1.10 (pitch unchanged). The script that is kept next to the file lists exactly what was spoken."""
    t0 = time.time(); rng = random.Random(l['id'])
    parts = load_parts(l); flat = [(pi, t) for pi, p in enumerate(parts) for t in p]
    files = asyncio.run(tts_all(l, [t for _, t in flat]))
    pauses = []
    for _, t in flat:                                                        # a pause after every turn, decided once so that leaving a part out does not change the others
        p = float(t.get('p', 0.8)); p = p * rng.uniform(0.85, 1.25) if p < 3 else p
        if t['s'] == 'T' and t['t'].rstrip().endswith('?') and p < 1.2: p += rng.uniform(0.4, 1.4)         # waiting for an answer
        pauses.append(round(p * PAUSE_SCALE, 1))
    secs = [os.path.getsize(f) * 8 / 48000 + p for f, p in zip(files, pauses)]               # edge-tts gives 48 kbit/s mp3
    part_secs = {}
    for (pi, _), x in zip(flat, secs): part_secs[pi] = part_secs.get(pi, 0) + x
    keep, total = set(part_secs), sum(secs)
    for d in DROP.get(l['id'], []):
        if total <= MAX_SEC * MAX_TEMPO: break
        keep.discard(d); total -= part_secs[d]
    idx = [k for k, (pi, _) in enumerate(flat) if pi in keep]
    turns = [flat[k][1] for k in idx]
    lst = os.path.join(WORK, l['id'] + '_list.txt'); lines = []
    for k in idx:
        lines.append(f"file '{files[k].replace(os.sep, '/')}'"); lines.append(f"file '{silence(pauses[k]).replace(os.sep, '/')}'")
    open(lst, 'w', encoding='utf-8').write('\n'.join(lines))
    out = os.path.join(OUT, l['file'] + '.mp3'); tmp = os.path.join(WORK, l['id'] + '_mix.mp3')
    run([ffmpeg(), '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-f', 'lavfi', '-i', 'anoisesrc=c=pink:r=24000:a=0.006', '-filter_complex',
         '[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,highpass=f=80,alimiter=limit=0.95[a]', '-map', '[a]', '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '24000', '-ac', '1', tmp])
    dur = duration(tmp); note = ''
    if dur > MAX_SEC or dur < MIN_SEC:                                     # a small stretch brings it inside 31-39 minutes
        factor = min(MAX_TEMPO, max(0.9, dur / (2300 if dur > MAX_SEC else 1920)))
        run([ffmpeg(), '-y', '-i', tmp, '-filter:a', f'atempo={factor:.4f}', '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', '24000', '-ac', '1', out]); note = f'tempo x{factor:.2f}'
    else:
        os.replace(tmp, out)
    dur = duration(out)
    dropped = sorted(set(part_secs) - keep)
    json.dump(dict(lesson={k: v for k, v in l.items() if k not in ('phases', 'voices')}, dropped_parts=[x + 1 for x in dropped], turns=turns), open(os.path.join(SCRIPTS, l['file'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    words = sum(len(t['t'].split()) for t in turns)
    flag = '' if 30 * 60 <= dur <= 40 * 60 else '   <-- NOT 30-40 MINUTES'
    print(f"{l['id']} {os.path.basename(out)}  {dur / 60:.1f} min  {os.path.getsize(out) / 1e6:.1f} MB  {len(turns)} turns  {words} words  dropped parts {dropped or '-'}  {note}  ({time.time() - t0:.0f}s){flag}", flush=True)
    return dur


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'; ids = sys.argv[2:] or [l['id'] for l in LESSONS]
    ls = [NAMES[i] for i in ids]
    if cmd in ('script', 'all'):
        with ThreadPoolExecutor(len(ls)) as ex: list(ex.map(write_script, ls))
    if cmd in ('audio', 'all'):
        for l in ls: make_audio(l)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
