"""CRP logins for the CRP app: email + password, then a signed token (the same method as the teacher app, with its own key).

One demo account is created automatically (DEMO_CRP_EMAIL, default crp1@gmail.com, with the password in DEMO_CRP_PASSWORD,
default pass123) so the prototype can be shown; set DEMO_CRP_LOGIN=0 to switch it off. Accounts people make themselves use
exactly the same table, hashing, tokens and checks. Passwords are stored as salted scrypt hashes. The token is HMAC-signed and
expires after 30 days. Failed logins are rate limited per email, new accounts per network address.
"""
import hashlib, hmac, json, os, re, time

from fastapi import HTTPException, Request

from .prioritization.data import get_conn
from .teacher_auth import _b64, _unb64, check_password, hash_password

TOKEN_DAYS = 30
COOKIE = 'crp_session'
TITLES = ('Mr.', 'Mrs.', 'Ms.')
_fails: dict[str, list[float]] = {}
_signups: dict[str, list[float]] = {}


def _secret() -> bytes:
    # Its own key (derived), so a teacher's token can never be used as a CRP's.
    return hashlib.sha256(b'crp-app|' + os.environ.get('TEACHER_AUTH_SECRET', 'dev-only-change-me').encode()).digest()


def demo_enabled() -> bool: return os.environ.get('DEMO_CRP_LOGIN', '1').strip() not in ('0', 'false', 'off', 'no')
def demo_email() -> str: return os.environ.get('DEMO_CRP_EMAIL', 'crp1@gmail.com').strip().lower()
def demo_password() -> str: return os.environ.get('DEMO_CRP_PASSWORD', 'pass123')


def make_token(account_id: str) -> str:
    body = _b64(json.dumps({'c': str(account_id), 'exp': int(time.time()) + TOKEN_DAYS * 86400}).encode())
    return f'{body}.{_b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())}'


def read_token(token: str | None) -> str | None:
    try:
        body, sig = (token or '').split('.')
        if not hmac.compare_digest(_b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest()), sig): return None
        d = json.loads(_unb64(body))
        return d['c'] if d['exp'] > time.time() else None
    except Exception:
        return None


def from_request(request: Request) -> str | None:
    """The signed-in account id, or None. The app sends 'Authorization: Bearer <token>'. Links the browser opens by itself
    (a recording, a PDF, a picture) cannot send that header, so for reading only (GET) the session cookie is accepted too."""
    auth = request.headers.get('authorization') or ''
    if auth.lower().startswith('bearer '): return read_token(auth.split(' ', 1)[1].strip())
    if request.method in ('GET', 'HEAD'): return read_token(request.cookies.get(COOKIE))
    return None


def public(a) -> dict:
    """What the app may know about the signed-in person."""
    title = a.get('title')
    return dict(id=str(a['id']), email=a['email'], name=a['full_name'], title=title,
                salutation='sir' if title == 'Mr.' else 'maam' if title in ('Mrs.', 'Ms.') else None,
                is_demo=bool(a['is_demo']), cluster=a.get('cluster'), district=a.get('district'))


def get_account(conn, account_id: str):
    return conn.execute('select a.*, c.cluster, c.district from crp_accounts a join crps c on c.id = a.crp_id where a.id = %s', (account_id,)).fetchone()


def _split_title(full_name: str) -> tuple[str | None, str]:
    m = re.match(r'^(Mr\.|Mrs\.|Ms\.)\s+(.+)$', full_name.strip())
    return (m.group(1), m.group(2)) if m else (None, full_name.strip())


def ensure_demo(conn) -> bool:
    """Create the demo account if it is missing (and demo login is on). Safe to run any number of times."""
    if not demo_enabled(): return False
    if conn.execute('select 1 from crp_accounts where email = %s', (demo_email(),)).fetchone(): return False
    crp = conn.execute('select id, full_name from crps order by code limit 1').fetchone()
    if not crp: return False
    title, name = _split_title(crp['full_name'])
    conn.execute('insert into crp_accounts (crp_id, email, password_hash, full_name, title, is_demo) values (%s,%s,%s,%s,%s,true)',
                 (crp['id'], demo_email(), hash_password(demo_password()), name, title))
    conn.commit()
    return True


def login(email: str, password: str) -> dict:
    email = email.strip().lower()
    now = time.time()
    recent = [x for x in _fails.get(email, []) if now - x < 300]
    if len(recent) >= 5: raise HTTPException(429, 'Too many wrong attempts. Please wait a few minutes and try again.')
    with get_conn() as conn:
        a = conn.execute('select a.*, c.cluster, c.district from crp_accounts a join crps c on c.id = a.crp_id where a.email = %s', (email,)).fetchone()
        if not a or not check_password(password, a['password_hash']):
            _fails[email] = recent + [now]
            raise HTTPException(401, 'Email or password is not correct.')
        conn.execute('update crp_accounts set last_login = now() where id = %s', (a['id'],))
        conn.commit()
    _fails.pop(email, None)
    return a


def signup(email: str, password: str, full_name: str, title: str | None, client: str) -> dict:
    email = email.strip().lower(); full_name = re.sub(r'\s+', ' ', full_name).strip()
    if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]{2,}', email): raise HTTPException(400, 'Please enter a correct email address.')
    if len(full_name) < 2: raise HTTPException(400, 'Please enter your name.')
    if len(password) < 8: raise HTTPException(400, 'Choose a password with at least 8 letters or numbers.')
    if len(password) > 200 or len(email) > 200 or len(full_name) > 120: raise HTTPException(400, 'That is too long.')
    title = title if title in TITLES else None
    now = time.time()
    recent = [x for x in _signups.get(client, []) if now - x < 3600]
    if len(recent) >= 5: raise HTTPException(429, 'Too many new accounts from here. Please try again later.')
    with get_conn() as conn:
        if conn.execute('select 1 from crp_accounts where email = %s', (email,)).fetchone():
            raise HTTPException(409, 'An account with this email already exists. Please sign in.')
        # One cluster of schools exists today, so every account works on it. With more clusters this is where a new CRP gets theirs.
        crp = conn.execute('select id from crps order by code limit 1').fetchone()
        if not crp: raise HTTPException(503, 'The app is not set up yet. Please try again later.')
        aid = conn.execute('insert into crp_accounts (crp_id, email, password_hash, full_name, title, last_login) values (%s,%s,%s,%s,%s, now()) returning id',
                           (crp['id'], email, hash_password(password), full_name, title)).fetchone()['id']
        conn.execute("insert into audit_logs (action, entity_type, details) values ('crp_account_created', 'crp_account', %s)", (json.dumps(dict(email=email)),))
        conn.commit()
        a = get_account(conn, aid)
    _signups[client] = recent + [now]
    return a


def change_password(account_id: str, old: str, new: str):
    if len(new) < 8: raise HTTPException(400, 'Choose a password with at least 8 letters or numbers.')
    with get_conn() as conn:
        a = conn.execute('select * from crp_accounts where id = %s', (account_id,)).fetchone()
        if not a or not check_password(old, a['password_hash']): raise HTTPException(401, 'The current password is not correct.')
        if a['is_demo']: raise HTTPException(400, 'The demo account keeps its password, so everyone can use it.')
        conn.execute('update crp_accounts set password_hash = %s where id = %s', (hash_password(new), account_id))
        conn.commit()
