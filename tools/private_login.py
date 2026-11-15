"""The private sign-in for the test scripts: it is read from the owner's `.env` (or the environment), never written in the code.

    from private_login import crp_login, teacher_password
    email, password = crp_login()              # the man's sign-in; crp_login('female') for the woman's
"""
import os
import re
from pathlib import Path

ENV = Path(__file__).resolve().parents[1] / '.env'


def setting(name: str, default: str = '') -> str:
    if os.environ.get(name): return os.environ[name]
    try: m = re.search(rf'^{name}=(.*)$', ENV.read_text(encoding='utf-8'), re.M)
    except OSError: m = None
    return m.group(1).strip() if m else default


def crp_login(who: str = 'male') -> tuple[str, str]:
    email, password = setting(f'CRP_LOGIN_{who.upper()}_EMAIL'), setting('CRP_LOGIN_PASSWORD')
    if not email or not password: raise SystemExit('Set CRP_LOGIN_MALE_EMAIL, CRP_LOGIN_FEMALE_EMAIL and CRP_LOGIN_PASSWORD in .env first (see .env.example).')
    return email, password


def teacher_password() -> str:
    return setting('DEMO_TEACHER_PASSWORD')
