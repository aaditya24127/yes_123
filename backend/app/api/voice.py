"""Voice assistant endpoint: one spoken sentence in, what to say and what to do on the website out."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import ai
from ..services import voice_assistant

router = APIRouter(prefix='/api/voice', tags=['voice'])


class TurnReq(BaseModel):
    utterance: str
    language: str = 'English'
    page: str | None = None
    page_state: dict | list | str | None = None
    history: list[dict] = []


@router.post('/turn')
def turn(req: TurnReq):
    if not req.utterance.strip(): raise HTTPException(400, 'Nothing was said.')
    try:
        return voice_assistant.turn(req.model_dump())
    except ai.AIUnavailable as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, f'The assistant could not answer: {str(e)[:160]}')


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
