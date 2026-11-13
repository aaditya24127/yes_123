"""Signing in to the CRP app: demo account, own account, who am I, sign out."""
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from ..services import crp_auth
from ..services.prioritization.data import get_conn

router = APIRouter(prefix='/api/auth', tags=['auth'])


class LoginReq(BaseModel):
    email: str
    password: str


class SignupReq(BaseModel):
    email: str
    password: str
    full_name: str
    title: str | None = None       # 'Mr.' | 'Mrs.' | 'Ms.' | nothing


class PasswordReq(BaseModel):
    old: str
    new: str


def _signed_in(response: Response, request: Request, account) -> dict:
    token = crp_auth.make_token(account['id'])
    # The cookie only lets the browser open recordings, pictures and PDFs by itself (reading). Everything else uses the token.
    secure = request.headers.get('x-forwarded-proto', request.url.scheme) == 'https'
    response.set_cookie(crp_auth.COOKIE, token, max_age=crp_auth.TOKEN_DAYS * 86400, httponly=True, samesite='lax', secure=secure, path='/api')
    return dict(token=token, user=crp_auth.public(account))


@router.get('/demo')
def demo():
    """The demo account for showing the prototype (the sign-in page offers to fill it in). Off when DEMO_CRP_LOGIN=0."""
    if not crp_auth.demo_enabled(): return dict(enabled=False)
    return dict(enabled=True, email=crp_auth.demo_email(), password=crp_auth.demo_password())


@router.post('/login')
def login(req: LoginReq, request: Request, response: Response):
    return _signed_in(response, request, crp_auth.login(req.email, req.password))


@router.post('/signup')
def signup(req: SignupReq, request: Request, response: Response):
    client = (request.headers.get('x-forwarded-for') or (request.client.host if request.client else '') or 'unknown').split(',')[0].strip()
    return _signed_in(response, request, crp_auth.signup(req.email, req.password, req.full_name, req.title, client))


@router.get('/me')
def me(request: Request):
    aid = crp_auth.from_request(request)
    if not aid: raise HTTPException(401, 'Please sign in.')
    with get_conn() as conn:
        a = crp_auth.get_account(conn, aid)
    if not a: raise HTTPException(401, 'Please sign in.')
    return crp_auth.public(a)


@router.post('/password')
def password(req: PasswordReq, request: Request):
    aid = crp_auth.from_request(request)
    if not aid: raise HTTPException(401, 'Please sign in.')
    crp_auth.change_password(aid, req.old, req.new)
    return dict(ok=True)


@router.post('/logout')
def logout(response: Response):
    response.delete_cookie(crp_auth.COOKIE, path='/api')
    return dict(ok=True)
