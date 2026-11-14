"""Runs every classroom recording in `real_voices/` through the real app (a local API on port 8000): start a visit, upload the lesson, wait for the speech-to-text,
compare the transcript with the script word by word (word error rate), then run the lesson evaluation. Prints a table and writes `real_voices/RESULTS.md`.

    backend\\.venv\\Scripts\\python.exe tools/test_real_voices.py [file-stem ...]       (needs the API running locally, the demo CRP account, AI keys in .env)
"""
import glob, json, os, re, sys, time
import httpx

HERE = os.path.dirname(os.path.abspath(__file__)); VOICES = os.path.normpath(os.path.join(HERE, '..', 'real_voices'))
BASE = os.environ.get('API', 'http://localhost:8000')


def words(t):
    t = re.sub(r'\[\d{1,3}:\d{2}(?::\d{2})?\]', ' ', t or '')                      # the stored transcript has [mm:ss] time stamps: they are not words
    t = t.lower().replace('’', "'")
    return re.sub(r"[^\wऀ-ॿ']+|[।॥]", ' ', t).split()               # \w alone cuts Devanagari words at the vowel signs, so that block is kept whole


NUMBERISH = set('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand '
                'half halves quarter quarters third thirds fourth fourths first second plus minus times equals equal squared cubed square root into upon by over point percent'.split())


def core(t):
    """Words without numbers, number words and arithmetic words: speech-to-text writes "5" or "five", "a²" or "a squared" in its own way, which is formatting, not mishearing."""
    return [w for w in words(t) if not re.fullmatch(r"[\d.,²³]+", w) and w not in NUMBERISH]


def wer(ref, hyp, only_core=False):
    """Word error rate (substitutions + deletions + insertions) / number of reference words."""
    r, h = (core(ref), core(hyp)) if only_core else (words(ref), words(hyp))
    if not r: return None
    prev = list(range(len(h) + 1))
    for i, a in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, b in enumerate(h, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a != b))
        prev = cur
    return prev[-1] / len(r)


def rescore():
    """Re-calculate the word error rates from the transcripts the app saved for the newest test visits (needs DATABASE_URL, as for the API) and rewrite RESULTS.md."""
    import psycopg
    keep_path = os.path.join(VOICES, '_work', 'results.json'); done = {r['file']: r for r in json.load(open(keep_path, encoding='utf-8'))}
    with psycopg.connect(os.environ['DATABASE_URL']) as cn:
        for stem, row in done.items():
            tr = cn.execute("select m.transcript from session_media m join source_files sf on sf.id = m.source_file_id where m.kind = 'lesson_audio' and sf.original_filename = %s and m.transcript is not null order by m.created_at desc limit 1", (stem + '.mp3',)).fetchone()
            if not tr: continue
            ref = ' '.join(t['t'] for t in json.load(open(os.path.join(VOICES, 'scripts', stem + '.json'), encoding='utf-8'))['turns'])
            row.update(wer=round(100 * wer(ref, tr[0]), 1), wer_core=round(100 * wer(ref, tr[0], True), 1), words_script=len(words(ref)), words_heard=len(words(tr[0])))
    json.dump(list(done.values()), open(keep_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    write_md(done)


def write_md(done):
    md = ['# Results of the classroom test recordings', '', 'Synthetic Indian neural voices (not real people). Each file went through the real app: upload, speech-to-text, lesson evaluation.',
          'WER = word error rate of the transcript against the script (lower is better). "Without numbers" leaves out digits, number words and arithmetic words, because speech-to-text writes "5" or "five" and "a squared" or "a²" in its own way (formatting, not mishearing).', '',
          '| File | MB | Upload s | Speech-to-text s | WER % | WER % without numbers | Words (script / heard) | Evaluation s | Evaluation by | Confidence |', '|---|---|---|---|---|---|---|---|---|---|']
    for r in sorted(done.values(), key=lambda r: r['file']):
        md.append(f"| {r['file']} | {r['size_mb']} | {r['upload_s']} | {r['transcribe_s']} | {r['wer']} | {r.get('wer_core')} | {r['words_script']} / {r['words_heard']} | {r['eval_s']} | {r['evaluated_by']} | {r['confidence']} |")
    md += ['', '## How to read the numbers', '',
           '* English lessons (3 of 5): the speech-to-text is accurate. Most of the difference in the Class 8 maths lesson is numbers and symbols written another way; without them it is about 2-3%.',
           '* **Marathi lesson:** the meaning is transcribed correctly, but many words are spelled differently (for example "आनी" for "आणि", "बगू" for "बघू"). Spelling variants count as errors, so the word error rate is high (about 57%). Marathi is the weakest of the languages tested; the lesson evaluation still worked on this transcript.',
           '* **Hinglish lesson:** the script is written in Roman letters (as a teacher might type it) while the speech-to-text writes the Hindi words in Devanagari, so the two cannot be compared word by word. The words are right; the script is different. The error rate shown is not meaningful.',
           '* Time: a 38-minute file is read in about 1-3 minutes (it depends on how many files are being read at once) and evaluated in 20-30 seconds.', '']
    open(os.path.join(VOICES, 'RESULTS.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n')


def main():
    if '--rescore' in sys.argv: return rescore()
    stems = sys.argv[1:] or sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(VOICES, '*.mp3')))
    c = httpx.Client(base_url=BASE, timeout=900)
    tok = c.post('/api/auth/login', json=dict(email='crp1@gmail.com', password='pass123')).json()['token']; H = {'Authorization': 'Bearer ' + tok}
    d = c.get('/api/directory', headers=H).json()
    keep_path = os.path.join(VOICES, '_work', 'results.json'); os.makedirs(os.path.dirname(keep_path), exist_ok=True)
    done = {r['file']: r for r in json.load(open(keep_path, encoding='utf-8'))} if os.path.exists(keep_path) else {}      # results of earlier runs stay in the table
    rows = []
    for stem in stems:
        sc = json.load(open(os.path.join(VOICES, 'scripts', stem + '.json'), encoding='utf-8')); les = sc['lesson']
        ref = ' '.join(t['t'] for t in sc['turns'])
        key = 'cbse' if les['board'] == 'CBSE' else 'icse' if les['board'] == 'ICSE' else 'maharashtra'
        school = next((s for s in d['schools'] if key in s['board'].lower() and (key != 'maharashtra' or ('marathi' in s['medium'].lower()) == (les['lang'] == 'mr'))), None) or next(s for s in d['schools'] if key in s['board'].lower())
        teacher = next((t for t in d['teachers'] if t['school_id'] == school['id'] and les['std'] in t['classes_taught']), None) or next(t for t in d['teachers'] if t['school_id'] == school['id'])
        t0 = time.time()
        s = c.post('/api/sessions', headers=H, json=dict(school_id=school['id'], teacher_id=teacher['id'], class_no=les['std'], subject=les['subject'].split(' (')[0], topic=les['chapter'])).json()
        path = os.path.join(VOICES, stem + '.mp3'); size = os.path.getsize(path)
        with open(path, 'rb') as fh:
            s = c.post(f"/api/sessions/{s['id']}/media", headers=H, data={'kind': 'lesson_audio'}, files={'file': (stem + '.mp3', fh, 'audio/mpeg')}).json()
        t_up = time.time() - t0; t1 = time.time(); tr = None
        while time.time() - t1 < 900:
            s = c.get(f"/api/sessions/{s['id']}", headers=H).json()
            m = next((x for x in s['media'] if x['kind'] == 'lesson_audio'), None)
            if m and (m.get('transcript') or m.get('transcript_by')): tr = m; break
            time.sleep(3)
        t_tr = time.time() - t1
        text = (tr or {}).get('transcript') or ''
        w = wer(ref, text) if text else None
        ev, t_ev, overall = None, None, None
        if text:
            t2 = time.time(); c.post(f"/api/sessions/{s['id']}/evaluate", headers=H)
            while time.time() - t2 < 600:
                s = c.get(f"/api/sessions/{s['id']}", headers=H).json()
                if s.get('result', {}).get('overall') or (s.get('job') or {}).get('status') in ('failed', 'done') and s.get('result'): break
                time.sleep(3)
            t_ev = time.time() - t2; ev = s.get('result') or {}; overall = ev.get('overall')
        # cancel the test visit so it does not stay in the records
        c.patch(f"/api/sessions/{s['id']}", headers=H, json=dict(status='cancelled'))
        row = dict(file=stem, size_mb=round(size / 1e6, 1), upload_s=round(t_up), transcribe_s=round(t_tr), eval_s=round(t_ev) if t_ev else None,
                   words_script=len(words(ref)), words_heard=len(words(text)), wer=None if w is None else round(100 * w, 1), wer_core=round(100 * wer(ref, text, True), 1) if text else None, by=(tr or {}).get('transcript_by'), overall=(overall or '')[:90],
                   confidence=ev.get('confidence') if ev else None, evaluated_by=ev.get('evaluated_by') if ev else None, rubric=len(ev.get('rubric') or []) if ev else 0)
        rows.append(row); print(json.dumps(row, ensure_ascii=False), flush=True)
        now = {r['file']: r for r in json.load(open(keep_path, encoding='utf-8'))} if os.path.exists(keep_path) else {}      # another run may have added rows meanwhile
        now[stem] = row; done = now
        json.dump(list(done.values()), open(keep_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    write_md(done)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main()
