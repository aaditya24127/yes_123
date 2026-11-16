"""CRP logins for the CRP app: email + password, then a signed token (the same method as the teacher app, with its own key).

Who can sign in is decided by the HOST SETTINGS, never by the code: CRP_LOGIN_MALE_EMAIL, CRP_LOGIN_FEMALE_EMAIL and CRP_LOGIN_PASSWORD
(Render > Environment, and the private .env on the owner's computer). Nothing is written in the repository, so a copy of the code has no
login. When those settings exist the accounts are created / updated at start-up, and the old shared demo account is closed.
New accounts made on the sign-in page are off unless ALLOW_SIGNUP=1. Passwords are stored as salted scrypt hashes. The token is
HMAC-signed and expires after 30 days. Failed logins are rate limited per email, new accounts per network address.
"""
import hashlib, hmac, json, os, re, time

from fastapi import HTTPException, Request

from .prioritization.data import get_conn
from .teacher_auth import _b64, _unb64, auth_secret, check_fails, check_password, hash_password, note_fail

TOKEN_DAYS = 30
COOKIE = 'crp_session'
TITLES = ('Mr.', 'Mrs.', 'Ms.')
_fails: dict[str, list[float]] = {}
_signups: dict[str, list[float]] = {}


def _secret() -> bytes:
    # Its own key (derived), so a teacher's token can never be used as a CRP's.
    return hashlib.sha256(b'crp-app|' + auth_secret()).digest()


def signup_open() -> bool:
    """New accounts can be made on the sign-in page only when the host says so (ALLOW_SIGNUP=1). Off by default."""
    return os.environ.get('ALLOW_SIGNUP', '').strip().lower() in ('1', 'true', 'yes', 'on')


def provisioned() -> list[dict]:
    """The sign-ins named in the host settings: a man and a woman (the title decides how the assistant addresses them: sir / madam)."""
    pw = os.environ.get('CRP_LOGIN_PASSWORD', '')
    out = []
    for key, title, name in (('MALE', 'Mr.', 'Rohan Deshmukh'), ('FEMALE', 'Mrs.', 'Anjali Kulkarni')):
        email = os.environ.get(f'CRP_LOGIN_{key}_EMAIL', '').strip().lower()
        if email and pw: out.append(dict(email=email, password=pw, title=title, name=os.environ.get(f'CRP_LOGIN_{key}_NAME', name).strip() or name))
    return out


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


def ensure_logins(conn) -> int:
    """Make sure the sign-ins named in the host settings exist with the password given there (a changed password in the settings takes
    effect at the next start), and close the old shared demo account. With no sign-ins in the settings nothing is touched."""
    todo = provisioned()
    if not todo: return 0
    crp = conn.execute('select id from crps order by code limit 1').fetchone()
    if not crp: return 0
    changed = 0
    for p in todo:
        a = conn.execute('select id, password_hash, title, full_name from crp_accounts where email = %s', (p['email'],)).fetchone()
        if not a:
            conn.execute('insert into crp_accounts (crp_id, email, password_hash, full_name, title, is_demo) values (%s,%s,%s,%s,%s,false)', (crp['id'], p['email'], hash_password(p['password']), p['name'], p['title']))
            changed += 1
        elif not check_password(p['password'], a['password_hash']):
            conn.execute('update crp_accounts set password_hash = %s where id = %s', (hash_password(p['password']), a['id'])); changed += 1
    conn.execute('delete from crp_accounts where is_demo')          # the shared account of the earlier versions (everybody knew its password)
    conn.commit()
    return changed


def login(email: str, password: str, client: str = 'unknown') -> dict:
    email = email.strip().lower()[:200]
    check_fails(_fails, email, client)
    with get_conn() as conn:
        a = conn.execute('select a.*, c.cluster, c.district from crp_accounts a join crps c on c.id = a.crp_id where a.email = %s', (email,)).fetchone()
        if not a or not check_password(password, a['password_hash']):
            note_fail(_fails, email, client)
            raise HTTPException(401, 'Email or password is not correct.')
        conn.execute('update crp_accounts set last_login = now() where id = %s', (a['id'],))
        conn.commit()
    _fails.pop(f'{email}|{client}', None)
    return a


def signup(email: str, password: str, full_name: str, title: str | None, client: str) -> dict:
    if not signup_open(): raise HTTPException(403, 'New accounts are switched off. Please ask the owner for a sign-in.')
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
