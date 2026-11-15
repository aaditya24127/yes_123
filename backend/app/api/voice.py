"""Voice assistant endpoints: hear (speech to text), turn (understand and decide), speak (natural neural voice, streamed), warm-up."""
import collections
import logging
import threading
import time

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import ai
from ..services import voice_assistant, voice_audio

router = APIRouter(prefix='/api/voice', tags=['voice'])

# A limit per signed-in account and minute, so that nobody (a loop, a stuck page, a stranger with an account) can run up the AI and speech bills.
_hits: dict = collections.defaultdict(collections.deque)
_hits_lock = threading.Lock()
LIMITS = {'turn': 45, 'hear': 70, 'speak': 120}


def _limit(request: Request, what: str):
    who = str(getattr(request.state, 'crp_account_id', None) or (request.client.host if request.client else 'x'))
    now = time.time()
    with _hits_lock:
        q = _hits[(who, what)]
        while q and now - q[0] > 60: q.popleft()
        if len(q) >= LIMITS[what]: raise HTTPException(429, 'Please slow down a little. Try again in a few seconds.')
        q.append(now)


class TurnReq(BaseModel):
    utterance: str
    language: str = 'English'
    address: str | None = None             # 'sir' or 'madam': how the assistant addresses the CRP
    page: str | None = None
    page_state: dict | list | str | None = None
    history: list[dict] = []


@router.post('/turn')
def turn(req: TurnReq, request: Request):
    _limit(request, 'turn')
    if not req.utterance.strip(): raise HTTPException(400, 'Nothing was said.')
    try:
        return voice_assistant.turn(req.model_dump())
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        logging.getLogger('voice').exception('the assistant could not answer: %s', req.utterance[:80])      # shows in the server log, with the reason
        raise HTTPException(500, f'The assistant could not answer: {str(e)[:160]}')


@router.post('/hear')
def hear(request: Request, file: UploadFile = File(...), language: str = Form('en')):
    """One spoken sentence (a small WAV from the browser) -> the words. An empty text means nothing real was said."""
    _limit(request, 'hear')
    data = file.file.read()
    if len(data) < 1500: return dict(text='', language=None)
    if len(data) > 6_000_000: raise HTTPException(413, 'That recording is too long.')
    try:
        return voice_audio.transcribe(data, file.filename or 'speech.wav', language)
    except voice_audio.HearError as e:
        raise HTTPException(503, str(e))


class SpeakReq(BaseModel):
    text: str
    language: str = 'en'
    gender: str = 'male'                   # male | female
    accent: str = 'gb'                     # English only: gb (British, the calm butler voice) | us | in
    rate: float = 1.0


@router.post('/speak')
async def speak(req: SpeakReq, request: Request):
    """The text as natural speech, streamed as mp3 while it is being made."""
    _limit(request, 'speak')
    try:
        chunks = await voice_audio.stream_speech(req.text, req.language, req.gender, req.accent, req.rate)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:                                                          # noqa: BLE001
        raise HTTPException(503, str(e)[:160])
    return StreamingResponse(chunks, media_type='audio/mpeg', headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})


@router.post('/forget')
def forget():
    """The priorities changed: the next sentence should see the new ranking."""
    voice_assistant.forget()
    return dict(ok=True)


@router.post('/warm')
def warm():
    """Voice mode was switched on: get the assistant's view of the schools ready now."""
    voice_assistant.warm()
    return dict(ok=True)
