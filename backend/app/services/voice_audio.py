"""Hearing and speaking for the voice assistant, on the server.

HEARING  (`transcribe`): the browser listens to the microphone itself (it detects when the CRP starts and stops speaking) and sends each spoken sentence as a small WAV file.
         Groq's Whisper reads it in well under a second, in any of the app's languages. It is given a short list of the school and teacher names (Whisper's "prompt"), so a name such as
         "Wadgaon" or "Nimbalkar" is spelt the way the website knows it, and the usual invented words over silence ("Thank you", "you") are dropped.
SPEAKING (`stream_speech`): natural neural voices, streamed to the browser while they are being made, so the first words start after about half a second.
         Default: Microsoft's neural voices (the free `edge-tts` package; the newest conversational ones for English, an Indian neural voice, male and female, for each Indian language).
         Optional: if ELEVENLABS_API_KEY is set on the host, ElevenLabs is used for the languages it supports and Microsoft's voices take over for the rest or when it fails.
"""
import asyncio
import collections
import hashlib
import os
import re
import threading
import time

import httpx

from .prioritization.data import get_conn
from .voice import VOICE_FALLBACK, VOICES

# ---------------------------------------------------------------- hearing
_http = httpx.Client(timeout=25, limits=httpx.Limits(max_keepalive_connections=4, keepalive_expiry=120))     # one connection kept open: each sentence saves the TLS handshake
GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
WHISPER_LANG = {'en': 'en', 'hi': 'hi', 'bn': 'bn', 'mr': 'mr', 'te': 'te', 'ta': 'ta', 'gu': 'gu', 'ur': 'ur', 'kn': 'kn', 'ml': 'ml'}      # Odia: Whisper has no Odia, it is asked to find the language itself
INVENTED = {'you', 'thank you', 'thanks for watching', 'thank you for watching', 'thanks', 'bye', 'bye bye', 'subscribe', 'the end', 'so', 'uh', 'um', 'hmm', 'mm', 'mmm',
            'amara org', 'subtitles by the amara org community', 'www mooji org'}


# A sentence in the language's own script leads the prompt: otherwise a prompt full of English names makes Whisper write Hindi or Marathi in Roman letters.
LEAD = {'hi': 'नमस्ते, मुझे स्कूल की विज़िट खोलनी है।', 'mr': 'नमस्कार, मला शाळेची भेट उघडायची आहे.', 'bn': 'নমস্কার, আমি স্কুল পরিদর্শন খুলতে চাই।',
        'te': 'నమస్కారం, నేను పాఠశాల సందర్శనను తెరవాలనుకుంటున్నాను.', 'ta': 'வணக்கம், நான் பள்ளி வருகையைத் திறக்க விரும்புகிறேன்.', 'gu': 'નમસ્તે, મારે શાળાની મુલાકાત ખોલવી છે.',
        'ur': 'السلام علیکم، میں اسکول کا دورہ کھولنا چاہتا ہوں۔', 'kn': 'ನಮಸ್ಕಾರ, ನಾನು ಶಾಲೆಯ ಭೇಟಿಯನ್ನು ತೆರೆಯಲು ಬಯಸುತ್ತೇನೆ.', 'ml': 'നമസ്കാരം, എനിക്ക് സ്കൂൾ സന്ദർശനം തുറക്കണം.'}


# The words of the website's menus and the main questions, in each language's own script, follow the lead sentence: Whisper then spells them right (measured with Marathi commands spoken by
# a neural voice: 7 of 11 understood with the lead sentence alone, 10 of 11 with these words). Only the language's own script: Latin words would pull the answer into Roman letters.
_WORDS = {
    'hi': 'विज़िट पेज, प्राथमिकता सूची, शिक्षक, स्कूल, इस स्कूल के शिक्षक कौन हैं, ड्रॉपडाउन, सेटिंग्स, भाषा बदलो।',
    'mr': 'भेटीचे पान, प्राधान्यक्रम, शिक्षक, शाळा, शाळेतील शिक्षक कोण आहेत, ड्रॉपडाउन, सेटिंग्ज, भाषा बदला.',
    'bn': 'স্কুল পরিদর্শন, অগ্রাধিকার, শিক্ষক, স্কুল, সেটিংস, ভাষা।',
    'te': 'పాఠశాల సందర్శన, ప్రాధాన్యతలు, ఉపాధ్యాయులు, పాఠశాల, సెట్టింగ్\u200cలు, భాష.',
    'ta': 'பள்ளி வருகை, முன்னுரிமைகள், ஆசிரியர்கள், பள்ளி, அமைப்புகள், மொழி.',
    'gu': 'શાળા મુલાકાત, પ્રાથમિકતાઓ, શિક્ષકો, શાળા, સેટિંગ્સ, ભાષા.',
    'ur': 'اسکول کا دورہ، ترجیحات، اساتذہ، اسکول، سیٹنگز، زبان۔',
    'kn': 'ಶಾಲಾ ಭೇಟಿ, ಆದ್ಯತೆಗಳು, ಶಿಕ್ಷಕರು, ಶಾಲೆ, ಸೆಟ್ಟಿಂಗ್\u200cಗಳು, ಭಾಷೆ.',
    'ml': 'സ്കൂൾ സന്ദർശനം, മുൻഗണനകൾ, അധ്യാപകർ, സ്കൂൾ, ക്രമീകരണങ്ങൾ, ഭാഷ.',
}
LEAD = {k: (v + ' ' + _WORDS.get(k, '')).strip() for k, v in LEAD.items()}


class HearError(RuntimeError):
    pass


_names = {'at': 0.0, 'text': ''}
_names_lock = threading.Lock()


def _vocabulary() -> str:
    """School and teacher names, for Whisper's prompt (kept for ten minutes; a few hundred characters)."""
    with _names_lock:
        if time.time() - _names['at'] < 600 and _names['text']: return _names['text']
    try:
        with get_conn() as conn:
            schools = [r['name'] for r in conn.execute('select name from schools where is_active order by code').fetchall()]
            teachers = [f"{r['title'] or ''} {r['full_name']}".strip() for r in conn.execute('select title, full_name from teachers where is_active order by teacher_code').fetchall()]
        text = 'CRP Mentor Copilot. Schools: ' + ', '.join(schools) + '. Teachers: ' + ', '.join(teachers)
        text = text[:900].rsplit(',', 1)[0] + '.'
    except Exception:
        text = 'CRP Mentor Copilot. Schools, teachers, visit, priorities, assessment, chapter, settings.'
    with _names_lock:
        _names.update(at=time.time(), text=text)
    return text


def _key() -> str:
    k = os.environ.get('GROQ_API_KEY', '').strip()
    if not k: raise HearError('Speech-to-text is not set up on this server (GROQ_API_KEY).')
    return k


def transcribe(data: bytes, filename: str, language: str) -> dict:
    """{text, language}. An empty text means nothing real was said."""
    code = WHISPER_LANG.get(language)
    model = os.environ.get('VOICE_STT_MODEL') or 'whisper-large-v3'                  # measured on spoken commands: as fast as the turbo model (about 0.8 s) and spells names and colours right
    names = _vocabulary()
    colours = 'Colours: Royal blue, Evergreen, Deep teal, Plum, Crimson dusk, Fiery ocean, Burgundy sand, Papyrus.'
    # English: colours and the names of the schools and teachers help the spelling. Indian languages: ONLY the sentence in their own script, because Latin names in the prompt make Whisper
    # write Marathi / Hindi in Roman letters (or even translate it: 'इंग्रजी भाषा लावा' came back as 'English Language'); the school names said in Devanagari are matched to the records by the AI.
    prompt = (colours + ' ' + names[:560].rsplit(',', 1)[0]) if language == 'en' else LEAD.get(language, '')
    form = {'model': model, 'response_format': 'verbose_json', 'temperature': '0', 'prompt': prompt}
    if code: form['language'] = code
    last = None
    for attempt in range(2):
        try:
            r = _http.post(GROQ_URL, headers={'Authorization': f'Bearer {_key()}'}, files={'file': (filename or 'speech.wav', data, 'audio/wav')}, data=form)
            if r.status_code == 200: break
            last = f'Groq answered {r.status_code}'
            if r.status_code in (400, 401, 403, 413): break          # asking again would not help
        except httpx.HTTPError as e:
            last = f'{type(e).__name__}'
        time.sleep(0.4)
    else:
        raise HearError(f'The speech service could not be reached ({last}).')
    if r.status_code != 200: raise HearError(f'The speech service said no ({last}).')
    j = r.json()
    segs = [s for s in (j.get('segments') or []) if not (s.get('no_speech_prob', 0) > 0.55 and s.get('avg_logprob', 0) < -0.5) and s.get('compression_ratio', 0) < 2.4]
    text = ' '.join(s['text'].strip() for s in segs).strip() if j.get('segments') is not None else (j.get('text') or '').strip()
    plain = re.sub(r'[^\w\s]', '', text.lower()).strip()
    if plain in INVENTED: text = ''
    return dict(text=text, language=j.get('language'))


# ---------------------------------------------------------------- speaking
ACCENT_VOICES = {                                   # (male, female): English, by accent. gb = the calm British butler voice, us = Microsoft's newest conversational voices
    'gb': ('en-GB-RyanNeural', 'en-GB-SoniaNeural'),
    'us': ('en-US-AndrewNeural', 'en-US-AvaNeural'),
    'in': ('en-IN-PrabhatNeural', 'en-IN-NeerjaNeural'),
}
ELEVEN_LANGS = {'en', 'hi', 'ta'}                   # what ElevenLabs' fast model speaks well among the app's languages
ELEVEN_DEFAULT = {'male': 'JBFqnCBsd6RMkjVDRZzb', 'female': 'Xb7hH8MSUJpSbSDYk0k2'}          # George and Alice (British), ElevenLabs' ready-made voices; override with ELEVENLABS_VOICE_MALE / _FEMALE
MAX_CHARS = 700


def pick_voice(language: str, gender: str, accent: str) -> str:
    male = gender != 'female'
    if language == 'en': return ACCENT_VOICES.get(accent, ACCENT_VOICES['gb'])[0 if male else 1]
    lang = language if language in VOICES else VOICE_FALLBACK.get(language, 'en')
    if lang == 'en': return ACCENT_VOICES['in'][0 if male else 1]
    return VOICES[lang][0 if male else 1]


_cache: 'collections.OrderedDict[str, bytes]' = collections.OrderedDict()
_cache_lock = threading.Lock()


def _cached(key):
    with _cache_lock:
        v = _cache.get(key)
        if v is not None: _cache.move_to_end(key)
        return v


def _remember(key, data):
    with _cache_lock:
        _cache[key] = data
        while len(_cache) > 300: _cache.popitem(last=False)


def clean_text(text: str) -> str:
    """Plain speech: no markdown or symbols that a voice would read out."""
    text = re.sub(r'[*_#`>~|]+', ' ', text or '')
    text = re.sub(r'https?://\S+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()[:MAX_CHARS]


async def _edge_chunks(text: str, voice: str, rate: str, pitch: str):
    import edge_tts
    async for chunk in edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).stream():
        if chunk['type'] == 'audio' and chunk['data']: yield chunk['data']


async def _eleven_chunks(text: str, language: str, gender: str):
    key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    vid = os.environ.get('ELEVENLABS_VOICE_MALE' if gender != 'female' else 'ELEVENLABS_VOICE_FEMALE') or ELEVEN_DEFAULT['male' if gender != 'female' else 'female']
    body = {'text': text, 'model_id': os.environ.get('ELEVENLABS_MODEL', 'eleven_flash_v2_5'), 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.8, 'style': 0.15, 'use_speaker_boost': True}}
    async with httpx.AsyncClient(timeout=30) as c:
        async with c.stream('POST', f'https://api.elevenlabs.io/v1/text-to-speech/{vid}/stream', params={'output_format': 'mp3_44100_64', 'optimize_streaming_latency': '3'},
                            headers={'xi-api-key': key, 'accept': 'audio/mpeg'}, json=body) as r:
            if r.status_code != 200: raise RuntimeError(f'ElevenLabs answered {r.status_code}')
            async for b in r.aiter_bytes(4096):
                if b: yield b


async def stream_speech(text: str, language: str, gender: str = 'male', accent: str = 'gb', rate: float = 1.0):
    """An async iterator of mp3 bytes. The first chunk is fetched before returning, so a failure is reported before any audio is sent."""
    text = clean_text(text)
    if not text: raise ValueError('There is nothing to say.')
    eleven = bool(os.environ.get('ELEVENLABS_API_KEY', '').strip()) and language in ELEVEN_LANGS
    voice = pick_voice(language, gender, accent)
    pct = max(-30, min(40, round((rate - 1) * 100)))
    rate_s = f'{pct:+d}%'; pitch = '+0Hz'
    key = hashlib.sha1(f'{"el" if eleven else voice}|{language}|{gender}|{rate_s}|{text}'.encode('utf8')).hexdigest()
    hit = _cached(key)
    if hit is not None:
        async def replay():
            yield hit
        return replay()

    async def start(kind, wait):
        gen = _eleven_chunks(text, language, gender) if kind == 'eleven' else _edge_chunks(text, voice, rate_s, pitch)
        try:
            first = await asyncio.wait_for(gen.__anext__(), timeout=wait)
        except BaseException:
            try: await gen.aclose()                                                  # a stalled connection is let go before the next try
            except Exception: pass                                                   # noqa: BLE001
            raise
        return gen, first
    got = None
    # The free Microsoft service answers in 1 to 2 s, but now and then a connection stalls for 10 to 20 s: a try that has produced nothing after 6 s is dropped and made again (three tries at most),
    # so a spike costs about 7 s instead of 20. ElevenLabs first when it is set up.
    order = ([('eleven', 6)] if eleven else []) + [('edge', 6), ('edge', 6), ('edge', 10)]
    last = None
    for kind, wait in order:
        try:
            got = await start(kind, wait); break
        except Exception as e:                                                       # noqa: BLE001
            last = e; await asyncio.sleep(0.1)
    if got is None: raise RuntimeError(f'The voice could not be made ({type(last).__name__}).')
    gen, first = got

    async def body():
        buf = bytearray(first); yield first
        try:
            async for b in gen:
                buf += b; yield b
        finally:
            if len(buf) > 2000: _remember(key, bytes(buf))
    return body()
