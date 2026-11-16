"""Teacher logins for the teacher app: email + password, then a signed token (no extra libraries).

Accounts are created automatically for every teacher: firstname.lastname@crp.com with the password in DEMO_TEACHER_PASSWORD
(a host setting: with none set, no account is created). Passwords are stored as salted scrypt hashes. The token is HMAC-signed with TEACHER_AUTH_SECRET and expires after
30 days. Failed logins are rate limited per email.
"""
import base64, hashlib, hmac, json, os, re, secrets, time

from fastapi import Header, HTTPException

from .prioritization.data import get_conn

DOMAIN = 'crp.com'
TOKEN_DAYS = 30
_fails: dict[str, list[float]] = {}


_PLACEHOLDERS = ('', 'dev-only-change-me', 'change-me-to-a-long-random-text')      # values anyone can read in the public repository
_PRIVATE_SETTINGS = ('SUPABASE_SERVICE_KEY', 'SUPABASE_DATABASE_URL', 'DATABASE_URL', 'CRP_LOGIN_PASSWORD')   # private values every real server already has
_stand_in: bytes | None = None


def auth_secret() -> bytes:
    """The key that signs sign-in tokens and report links (TEACHER_AUTH_SECRET in the host settings). On a real server (TARGET is not
    'local') a missing or placeholder value is never used, because anyone could then sign themselves in. A stand-in key is worked out
    from another private host setting instead: it is the same after every restart, so nobody is signed out again and report links keep
    working. (Only with no private setting at all is a random key made for the run.)"""
    global _stand_in
    s = os.environ.get('TEACHER_AUTH_SECRET', '').strip()
    if s not in _PLACEHOLDERS: return s.encode()
    if os.environ.get('TARGET', 'local').strip().lower() in ('', 'local'): return (s or 'dev-only-change-me').encode()
    if _stand_in is None:
        private = next((os.environ[k].strip() for k in _PRIVATE_SETTINGS if os.environ.get(k, '').strip()), None)
        _stand_in = hashlib.sha256(b'crp-token-key|' + private.encode()).digest() if private else secrets.token_bytes(32)
        print('WARNING: TEACHER_AUTH_SECRET is missing or still the example value. A stand-in key is used. '
              'Set a long random TEACHER_AUTH_SECRET in the host settings.', flush=True)
    return _stand_in


def _secret() -> bytes:
    return auth_secret()


# ---- wrong-password limit, shared by the teacher and the CRP sign-in
FAIL_WINDOW = 300            # seconds
FAILS_PER_PLACE = 10         # wrong passwords for one email from one network address (a hall full of people can share one address)
FAILS_PER_EMAIL = 40         # wrong passwords for one email from everywhere (so one person cannot lock another out with 5 tries)


def client_of(request) -> str:
    """The caller's network address (the first one in X-Forwarded-For when the request came through a proxy)."""
    fwd = request.headers.get('x-forwarded-for')
    return ((fwd or (request.client.host if request.client else '') or 'unknown').split(',')[0].strip())[:60]


def check_fails(fails: dict, email: str, client: str):
    now = time.time()
    if len(fails) > 5000:                                           # keep the memory small: drop everything that has expired
        for k in [k for k, v in fails.items() if not v or now - v[-1] >= FAIL_WINDOW]: fails.pop(k, None)
    for key, cap in ((f'{email}|{client}', FAILS_PER_PLACE), (email, FAILS_PER_EMAIL)):
        if len([x for x in fails.get(key, []) if now - x < FAIL_WINDOW]) >= cap:
            raise HTTPException(429, 'Too many wrong attempts. Please wait a few minutes and try again.')


def note_fail(fails: dict, email: str, client: str):
    now = time.time()
    for key in (f'{email}|{client}', email):
        fails[key] = [x for x in fails.get(key, []) if now - x < FAIL_WINDOW] + [now]


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f'scrypt${salt.hex()}${h.hex()}'


def check_password(pw: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split('$')
        return hmac.compare_digest(hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1).hex(), h)
    except Exception:
        return False


def _b64(b: bytes) -> str: return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def _unb64(s: str) -> bytes: return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def make_token(teacher_id: str) -> str:
    body = _b64(json.dumps({'t': str(teacher_id), 'exp': int(time.time()) + TOKEN_DAYS * 86400}).encode())
    return f'{body}.{_b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest())}'


def read_token(token: str) -> str | None:
    try:
        body, sig = token.split('.')
        if not hmac.compare_digest(_b64(hmac.new(_secret(), body.encode(), hashlib.sha256).digest()), sig): return None
        d = json.loads(_unb64(body))
        return d['t'] if d['exp'] > time.time() else None
    except Exception:
        return None


def email_for(full_name: str, taken: set) -> str:
    parts = [re.sub(r'[^a-z]', '', p.lower()) for p in full_name.split()]
    parts = [p for p in parts if p]
    base = '.'.join([parts[0], parts[-1]] if len(parts) > 1 else parts) or 'teacher'
    email, n = f'{base}@{DOMAIN}', 1
    while email in taken:
        n += 1
        email = f'{base}{n}@{DOMAIN}'
    return email


def ensure_accounts(conn) -> int:
    """Create the missing demo accounts (one per active teacher). Safe to run any number of times."""
    taken = {r['email'] for r in conn.execute('select email from teacher_accounts').fetchall()}
    todo = conn.execute('select t.id, t.full_name from teachers t where t.is_active and not exists (select 1 from teacher_accounts a where a.teacher_id = t.id) order by t.teacher_code').fetchall()
    plain = os.environ.get('DEMO_TEACHER_PASSWORD', '')
    if not plain: return 0                                           # no password in the host settings: no accounts are made (the code holds no password)
    pw = hash_password(plain)
    for t in todo:
        e = email_for(t['full_name'], taken)
        taken.add(e)
        conn.execute('insert into teacher_accounts (teacher_id, email, password_hash) values (%s,%s,%s)', (t['id'], e, pw))
    conn.commit()
    return len(todo)


def login(email: str, password: str, client: str = 'unknown'):
    email = email.strip().lower()[:200]
    check_fails(_fails, email, client)
    with get_conn() as conn:
        a = conn.execute('select * from teacher_accounts where email = %s', (email,)).fetchone()
        if not a or not check_password(password, a['password_hash']):
            note_fail(_fails, email, client)
            raise HTTPException(401, 'Email or password is not correct.')
        conn.execute('update teacher_accounts set last_login = now() where teacher_id = %s', (a['teacher_id'],))
        conn.commit()
    _fails.pop(f'{email}|{client}', None)
    return str(a['teacher_id'])


def current_teacher(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency: the teacher id from 'Authorization: Bearer <token>'."""
    tid = read_token(authorization.split(' ', 1)[1]) if authorization and authorization.lower().startswith('bearer ') else None
    if not tid: raise HTTPException(401, 'Please sign in again.')
    return tid
