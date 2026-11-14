"""The spoken review: a short voice message (about one minute) from the CRP to the teacher, in the teacher's language.

How it is made (nothing here is a fixed text):
  1. `voice_input` picks what matters from the evaluated visit: what went well, what to try, why the students found it hard, the next step.
  2. The AI (task `teacher_voice`) writes the message the way the CRP would say it, in the chosen language, warm and plain, with the teacher's name.
  3. A free Indian neural voice (Microsoft Edge voices through the `edge-tts` package; male or female like the CRP) reads it. About 5 seconds.
  4. The mp3 is saved with the visit; the teacher app and the WhatsApp message use a signed link to it.
Odia has no Indian voice yet, so its message is spoken in Hindi (the screen says so).
"""
import asyncio, hashlib, re

from .. import ai
from ..core.storage import get_storage

NAMES = {'en': 'English', 'hi': 'Hindi', 'bn': 'Bengali', 'mr': 'Marathi', 'te': 'Telugu', 'ta': 'Tamil', 'gu': 'Gujarati', 'ur': 'Urdu', 'kn': 'Kannada', 'or': 'Odia', 'ml': 'Malayalam'}
# (male, female) Indian neural voices
VOICES = {'en': ('en-IN-PrabhatNeural', 'en-IN-NeerjaNeural'), 'hi': ('hi-IN-MadhurNeural', 'hi-IN-SwaraNeural'), 'mr': ('mr-IN-ManoharNeural', 'mr-IN-AarohiNeural'),
          'bn': ('bn-IN-BashkarNeural', 'bn-IN-TanishaaNeural'), 'gu': ('gu-IN-NiranjanNeural', 'gu-IN-DhwaniNeural'), 'kn': ('kn-IN-GaganNeural', 'kn-IN-SapnaNeural'),
          'ml': ('ml-IN-MidhunNeural', 'ml-IN-SobhanaNeural'), 'ta': ('ta-IN-ValluvarNeural', 'ta-IN-PallaviNeural'), 'te': ('te-IN-MohanNeural', 'te-IN-ShrutiNeural'),
          'ur': ('ur-IN-SalmanNeural', 'ur-IN-GulNeural')}
VOICE_FALLBACK = {'or': 'hi'}                   # no Odia voice exists
# about 70 seconds of speech: agglutinative languages need fewer, longer words
WORDS = {'en': 180, 'hi': 190, 'bn': 185, 'mr': 200, 'te': 170, 'ta': 170, 'gu': 190, 'ur': 190, 'kn': 170, 'or': 185, 'ml': 150}
MAX_SECONDS = 85


def voice_language(lang: str) -> str:
    return lang if lang in VOICES else VOICE_FALLBACK.get(lang, 'en')


# Unicode block of each script: a message that is not mostly in it is in the wrong language
BLOCKS = {'hi': (0x0900, 0x097F), 'mr': (0x0900, 0x097F), 'bn': (0x0980, 0x09FF), 'gu': (0x0A80, 0x0AFF), 'or': (0x0B00, 0x0B7F), 'ta': (0x0B80, 0x0BFF), 'te': (0x0C00, 0x0C7F),
          'kn': (0x0C80, 0x0CFF), 'ml': (0x0D00, 0x0D7F), 'ur': (0x0600, 0x06FF)}


def in_script(text: str, language: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 40: return False
    lo, hi = BLOCKS.get(language, (0x41, 0x24F))
    return sum(lo <= ord(c) <= hi for c in letters) / len(letters) >= (0.9 if language == 'en' else 0.6)


def gender_of(title: str | None) -> str:
    return 'male' if title == 'Mr.' else 'female'


def _first(x, n=1):
    s = [t.strip() for t in re.split(r'(?<=[.!?])\s+', x or '') if t.strip()]
    return ' '.join(s[:n])


def voice_input(s, crp_name: str | None, gender: str, language: str):
    """What the AI is given: a few real points from the evaluated visit (never the whole report)."""
    r = s['result'] or {}
    brief = s['brief'] or {}
    t = brief.get('teacher') or {}
    name = (t.get('name') or 'the teacher').strip()
    title = name.split(' ')[0] if name.split(' ')[0] in ('Mr.', 'Mrs.', 'Ms.') else ''
    return dict(
        language=NAMES.get(language, 'English'), target_words=WORDS.get(language, 150),
        teacher_name=name, teacher_form_of_address='sir' if title == 'Mr.' else 'madam',
        crp_name=crp_name or 'your CRP', crp_gender=gender, school=(brief.get('school') or {}).get('name'),
        class_no=s['class_no'], subject=s['subject'], topic=s['topic'],
        overall=_first(r.get('overall'), 3),
        went_well=[dict(point=x.get('point'), seen=_first(x.get('evidence'))) for x in (r.get('strengths') or [])[:3]],
        to_improve=[dict(area=x.get('area'), seen=_first(x.get('evidence')), try_this=_first(x.get('try_this'), 2)) for x in (r.get('growth') or [])[:3]],
        students=dict(summary=_first((r.get('students') or {}).get('summary'), 2), why_hard=[dict(issue=x.get('issue'), reason=x.get('likely_reason'), teacher_can=x.get('teacher_action')) for x in ((r.get('students') or {}).get('reasons') or [])[:3]]),
        next_steps=[dict(action=x.get('action'), in_days=x.get('due_in_days')) for x in (r.get('next_steps') or [])[:3]],
        follow_up_days=s.get('followup_days') or 14)


def clean_script(text: str) -> str:
    """Plain speech for the voice: no markdown, no list marks, no emoji, one paragraph."""
    text = re.sub(r'[*_#`>~]+', '', text or '')
    text = re.sub(r'[\U0001F300-\U0001FAFF☀-➿]', '', text)
    text = re.sub(r'(?m)^\s*[-•\d]+[.)]?\s+', '', text)
    return re.sub(r'\s+', ' ', text).strip()


def _parts(text: str, n: int = 3) -> list[str]:
    """The message cut into n pieces of about the same length at the end of a sentence (Indian full stops included), so the pieces can be voiced side by side."""
    sents = [x.strip() for x in re.split(r'(?<=[.!?\u0964\u06d4])\s+', text) if x.strip()]
    if len(sents) < 2 * n: return [text]
    goal, out, cur = len(text) / n, [], ''
    for x in sents:
        if cur and len(cur) + len(x) / 2 > goal * (len(out) + 1) - sum(len(o) for o in out) and len(out) < n - 1: out.append(cur); cur = x
        else: cur = (cur + ' ' + x).strip()
    out.append(cur)
    return out


async def _speak_one(text: str, voice: str, rate: str) -> bytes:
    import edge_tts
    out = bytearray()
    async for chunk in edge_tts.Communicate(text, voice, rate=rate).stream():
        if chunk['type'] == 'audio': out += chunk['data']
    return bytes(out)


async def _speak(text: str, voice: str, rate: str) -> bytes:
    """The pieces are voiced at the same time (about three times faster than one long request) and joined; mp3 pieces play one after the other without a break."""
    pieces = await asyncio.gather(*[_speak_one(x, voice, rate) for x in _parts(text)])
    if any(not p for p in pieces): raise RuntimeError('empty audio')
    return b''.join(pieces)


def synth(text: str, language: str, gender: str) -> tuple[bytes, float, str, str]:
    """(mp3 bytes, seconds, voice name, rate). Reads a little faster if the message would run longer than about a minute and a half."""
    vl = voice_language(language); voice = VOICES[vl][0 if gender == 'male' else 1]
    last = None
    for rate in ('+0%', '+10%', '+18%'):
        for attempt in range(3):
            try:
                audio = asyncio.run(_speak(text, voice, rate)); break
            except Exception as e:           # the free voice service is sometimes busy
                last = e; audio = b''
        if not audio: raise RuntimeError(f'The voice could not be made right now ({last}).')
        seconds = len(audio) * 8 / 48000     # edge-tts sends 48 kbit/s mp3
        if seconds <= MAX_SECONDS: break
    return audio, seconds, voice, rate


def make(conn, sid: str, s, crp_name: str | None, gender: str, language: str, ai_choice: str | None = None) -> dict:
    """Write the message with the AI, speak it, save it with the visit. Returns what the screen needs."""
    import json
    import time
    language = language if language in NAMES else 'en'
    t0 = time.time()
    sl = voice_language(language)                  # the language the message is written (and spoken) in: Odia has no voice, so it is Hindi
    inp = voice_input(s, crp_name, gender, sl)
    r = ai.run('teacher_voice', inp, mode=ai_choice)
    script = clean_script(r.data.get('script'))
    if not in_script(script, sl):                  # some free models answer in English whatever they are asked: ask a stronger one once
        try:
            r = ai.run('teacher_voice', inp, only='claude_mid'); script = clean_script(r.data.get('script'))
        except Exception:
            pass
    if sl != 'en' and not in_script(script, sl): raise RuntimeError('The message could not be written in that language right now. Please try again, or choose English.')
    if not script: raise RuntimeError('The message could not be written.')
    t1 = time.time()
    audio, seconds, voice, rate = synth(script, language, gender)
    t2 = time.time()
    key = f"voice/{sid}/{language}_{gender}_{hashlib.sha1(script.encode('utf-8')).hexdigest()[:10]}.mp3"
    get_storage().put(key, audio, 'audio/mpeg')
    info = dict(language=language, voice_language=voice_language(language), gender=gender, voice=voice, rate=rate, script=script, message=clean_script(r.data.get('message')), key=key, seconds=round(seconds), by=r.provider, timing=dict(write=round(t1 - t0, 1), speak=round(t2 - t1, 1)),
                made_at=__import__('datetime').datetime.now().isoformat(timespec='seconds'))
    conn.execute('update visit_sessions set voice = %s where id = %s', (json.dumps(info), sid)); conn.commit()
    return info


def public(info: dict | None, sid: str, sig: str) -> dict | None:
    """The voice message as the screens see it (without the storage key)."""
    if not info: return None
    return dict(language=info['language'], voice_language=info.get('voice_language'), gender=info['gender'], voice=info['voice'], script=info['script'], seconds=info['seconds'], made_at=info.get('made_at'), by=info.get('by'), timing=info.get('timing'),
                url=f"/api/report/voice/{sid}.mp3?sig={sig}")
