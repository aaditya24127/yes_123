"""File storage abstraction: the same relative key (e.g. data/schools/S01_ZP_Wadgaon/assessments/x.xlsx) works locally and on Supabase.

STORAGE_BACKEND=local     files live under LOCAL_STORAGE_ROOT (default: the CRP project root)
STORAGE_BACKEND=supabase  files live in a PRIVATE bucket (SUPABASE_BUCKET); the service key stays on the server
"""
import json, os, hashlib, mimetypes
import urllib.request, urllib.error, urllib.parse
from pathlib import Path


class StorageError(RuntimeError):
    pass


class LocalStorage:
    name = 'local'

    def __init__(self, root):
        self.root = Path(root)

    def _p(self, key): return self.root / key

    def exists(self, key): return self._p(key).is_file()
    def get(self, key): return self._p(key).read_bytes()

    def put(self, key, data, content_type=None):
        p = self._p(key); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)

    def sha256(self, key): return hashlib.sha256(self.get(key)).hexdigest()

    def signed_url(self, key, expires=3600):
        return self._p(key).resolve().as_uri()         # local dev only; the API streams the file instead


class SupabaseStorage:
    name = 'supabase'

    def __init__(self, url, service_key, bucket):
        self.base = url.rstrip('/') + '/storage/v1'
        self.key, self.bucket = service_key, bucket

    def _req(self, method, path, data=None, headers=None):
        h = {'Authorization': f'Bearer {self.key}', 'apikey': self.key, **(headers or {})}
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def _obj(self, key): return f'/object/{self.bucket}/{urllib.parse.quote(key)}'

    def exists(self, key):
        code, _ = self._req('HEAD', f'/object/info/{self.bucket}/{urllib.parse.quote(key)}')
        return code == 200

    def get(self, key):
        code, body = self._req('GET', f'/object/authenticated/{self.bucket}/{urllib.parse.quote(key)}')
        if code != 200: raise StorageError(f'get {key}: {code}')
        return body

    def put(self, key, data, content_type=None):
        ct = content_type or mimetypes.guess_type(key)[0] or 'application/octet-stream'
        code, body = self._req('POST', self._obj(key), data, {'Content-Type': ct, 'x-upsert': 'true'})
        if code not in (200, 201): raise StorageError(f'put {key}: {code} {body[:200]!r}')

    def sha256(self, key): return hashlib.sha256(self.get(key)).hexdigest()

    def signed_url(self, key, expires=3600):
        code, body = self._req('POST', f'/object/sign/{self.bucket}/{urllib.parse.quote(key)}', json.dumps({'expiresIn': expires}).encode(),
                               {'Content-Type': 'application/json'})
        if code != 200: raise StorageError(f'sign {key}: {code}')
        return self.base + json.loads(body)['signedURL']


def get_storage(env=None):
    env = env or os.environ
    kind = env.get('STORAGE_BACKEND', 'local').lower()
    if kind == 'supabase':
        miss = [k for k in ('SUPABASE_URL', 'SUPABASE_SERVICE_KEY') if not env.get(k)]
        if miss: raise StorageError(f'missing env: {", ".join(miss)}')
        return SupabaseStorage(env['SUPABASE_URL'], env['SUPABASE_SERVICE_KEY'], env.get('SUPABASE_BUCKET', 'crp-files'))
    return LocalStorage(env.get('LOCAL_STORAGE_ROOT', str(Path(__file__).resolve().parents[3])))
