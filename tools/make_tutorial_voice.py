"""Make the tutorial's voice files: one MP3 per step and language, from the spoken lines ("v") in frontend/lib/tutorial/lang/*.json.

    pip install edge-tts
    python tools/make_tutorial_voice.py            (only lines that are new or changed)
    python tools/make_tutorial_voice.py --all      (everything again)

Files go to frontend/public/tutorial/voice/<language>/<step>.mp3. The voices are Microsoft's neural voices, reached through the
edge-tts tool (the read-aloud service of the Edge browser): fine for a prototype; for a real launch use a licensed text-to-speech
service (Azure Speech has the same voices) by replacing `speak()` below. A language without a voice here (Odia) gets no files:
the app then uses the device's own voice for that language if it has one, and otherwise shows the text only.
"""
import asyncio, hashlib, json, sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[1]
LANG_DIR = ROOT / 'frontend' / 'lib' / 'tutorial' / 'lang'
OUT = ROOT / 'frontend' / 'public' / 'tutorial' / 'voice'
VOICES = {      # one warm, clear voice per language
    'en': 'en-IN-NeerjaNeural', 'hi': 'hi-IN-SwaraNeural', 'mr': 'mr-IN-AarohiNeural', 'bn': 'bn-IN-TanishaaNeural', 'gu': 'gu-IN-DhwaniNeural',
    'kn': 'kn-IN-SapnaNeural', 'ml': 'ml-IN-SobhanaNeural', 'ta': 'ta-IN-PallaviNeural', 'te': 'te-IN-ShrutiNeural', 'ur': 'ur-IN-GulNeural',
}
RATE = '-6%'        # a little slower than normal: easier to follow


async def speak(text: str, voice: str, path: Path):
    for attempt in range(4):
        try:
            await edge_tts.Communicate(text, voice, rate=RATE).save(str(path))
            if path.stat().st_size > 2000: return
        except Exception as e:      # the service drops a call now and then: try again
            if attempt == 3: raise
            await asyncio.sleep(2 + attempt * 2)
    raise RuntimeError(f'empty audio for {path.name}')


async def main():
    redo = '--all' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    en = json.loads((LANG_DIR / 'en.json').read_text(encoding='utf-8'))['steps']
    marks_path = OUT / 'made.json'
    marks = json.loads(marks_path.read_text(encoding='utf-8')) if marks_path.exists() else {}
    sem = asyncio.Semaphore(4)
    todo, missing = [], []
    for lang, voice in VOICES.items():
        if only and lang not in only: continue
        steps = json.loads((LANG_DIR / f'{lang}.json').read_text(encoding='utf-8'))['steps']
        missing += [f'{lang}:{k}' for k in en if k not in steps]
        (OUT / lang).mkdir(parents=True, exist_ok=True)
        for key, line in steps.items():
            if key not in en: continue
            mark = hashlib.sha1(f"{voice}|{RATE}|{line['v']}".encode()).hexdigest()[:12]
            path = OUT / lang / f'{key}.mp3'
            if not redo and path.exists() and marks.get(f'{lang}/{key}') == mark: continue
            todo.append((lang, key, line['v'], voice, path, mark))
    if missing: print('lines missing (English will be shown, no voice):', ', '.join(missing))
    print(f'{len(todo)} voice files to make')
    done = 0

    async def one(lang, key, text, voice, path, mark):
        nonlocal done
        async with sem:
            try:
                await speak(text, voice, path); marks[f'{lang}/{key}'] = mark
            except Exception as e:
                print(f'FAILED {lang}/{key}: {str(e)[:120]}'); return
            done += 1
            if done % 40 == 0: print(f'  {done} / {len(todo)}')
    await asyncio.gather(*(one(*t) for t in todo))
    marks_path.write_text(json.dumps(marks, indent=0, sort_keys=True), encoding='utf-8')
    size = sum(f.stat().st_size for f in OUT.rglob('*.mp3'))
    print(f'made {done} of {len(todo)}; {len(list(OUT.rglob("*.mp3")))} files in total, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    asyncio.run(main())
