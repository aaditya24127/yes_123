"""Which database / storage to use, from .env. Switching the whole app to Supabase is one setting: TARGET=supabase
(it then uses SUPABASE_DATABASE_URL and Supabase Storage); TARGET=local uses DATABASE_URL and the local folder."""
import os


def target():
    return os.environ.get('TARGET', 'local').strip().lower() or 'local'


def database_url():
    if target() == 'supabase' and os.environ.get('SUPABASE_DATABASE_URL'):
        return os.environ['SUPABASE_DATABASE_URL']
    url = os.environ.get('DATABASE_URL')
    if not url: raise RuntimeError('DATABASE_URL is not set (copy .env.example to .env)')
    return url


def storage_backend():
    explicit = os.environ.get('STORAGE_BACKEND', '').strip().lower()
    if target() == 'supabase' and explicit in ('', 'local') and os.environ.get('SUPABASE_URL') and os.environ.get('SUPABASE_SERVICE_KEY'):
        return 'supabase'
    return explicit or 'local'
