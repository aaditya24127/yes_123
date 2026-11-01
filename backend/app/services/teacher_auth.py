"""Teacher logins for the teacher app: email + password, then a signed token (no extra libraries).

Demo accounts are created automatically for every teacher: firstname.lastname@crp.com with the password in DEMO_TEACHER_PASSWORD
(default pass123). Passwords are stored as salted scrypt hashes. The token is HMAC-signed with TEACHER_AUTH_SECRET and expires after
30 days. Failed logins are rate limited per email.
"""
import base64, hashlib, hmac, json, os, re, secrets, time

from fastapi import Header, HTTPException

from .prioritization.data import get_conn

DOMAIN = 'crp.com'
TOKEN_DAYS = 30
_fails: dict[str, list[float]] = {}


def _secret() -> bytes:
    return os.environ.get('TEACHER_AUTH_SECRET', 'dev-only-change-me').encode()


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
    pw = hash_password(os.environ.get('DEMO_TEACHER_PASSWORD', 'pass123'))
    for t in todo:
        e = email_for(t['full_name'], taken)
        taken.add(e)
        conn.execute('insert into teacher_accounts (teacher_id, email, password_hash) values (%s,%s,%s)', (t['id'], e, pw))
    conn.commit()
    return len(todo)


def login(email: str, password: str):
    email = email.strip().lower()
    now = time.time()
    recent = [x for x in _fails.get(email, []) if now - x < 300]
    if len(recent) >= 5: raise HTTPException(429, 'Too many wrong attempts. Please wait a few minutes and try again.')
    with get_conn() as conn:
        a = conn.execute('select * from teacher_accounts where email = %s', (email,)).fetchone()
        if not a or not check_password(password, a['password_hash']):
            _fails[email] = recent + [now]
            raise HTTPException(401, 'Email or password is not correct.')
        conn.execute('update teacher_accounts set last_login = now() where teacher_id = %s', (a['teacher_id'],))
        conn.commit()
    _fails.pop(email, None)
    return str(a['teacher_id'])


def current_teacher(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency: the teacher id from 'Authorization: Bearer <token>'."""
    tid = read_token(authorization.split(' ', 1)[1]) if authorization and authorization.lower().startswith('bearer ') else None
    if not tid: raise HTTPException(401, 'Please sign in again.')
    return tid
