"""Gemini, Ollama (local models), your own model behind a URL, and speech-to-text providers."""
import base64, io, os, tempfile, time
from pathlib import Path

import httpx

from .base import Provider, parse_json, schema_hint
from ..registry import AIError, Unsupported


class GeminiProvider(Provider):
    """Google Gemini over plain HTTPS. Reads PDFs, images and audio. The free tier may use inputs for training: demo data only."""
    needs_attachments_as = ('image/', 'application/pdf', 'audio/')

    def ping(self):
        model = self.cfg.get('model', 'gemini-2.5-flash')
        r = httpx.get(f'https://generativelanguage.googleapis.com/v1beta/models/{model}', params={'key': os.environ[self.cfg.get('needs_env', 'GEMINI_API_KEY')]}, timeout=20)
        if r.status_code == 200: return True, f'Key works; {model} is available'
        if r.status_code in (400, 401, 403): return False, 'The Gemini key was not accepted. Check GEMINI_API_KEY in .env'
        if r.status_code == 404: return False, f'Model {model} not found; change it in config/ai.json'
        return False, f'Gemini answered with error {r.status_code}'

    def run(self, task, input, attachments):
        self.check_attachments(attachments)
        model = self.cfg.get('model', 'gemini-2.5-flash')
        parts = [{'inline_data': {'mime_type': a.mime, 'data': base64.standard_b64encode(a.data).decode()}} for a in attachments]
        parts.append({'text': task.user(input) + '\n\n' + schema_hint(task.schema)})
        body = {'system_instruction': {'parts': [{'text': task.system()}]}, 'contents': [{'role': 'user', 'parts': parts}],
                'generationConfig': {'response_mime_type': 'application/json', 'temperature': 0}}
        r = httpx.post(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                       params={'key': os.environ[self.cfg.get('needs_env', 'GEMINI_API_KEY')]}, json=body, timeout=self.cfg.get('timeout', 180))
        if r.status_code != 200: raise AIError(f'Gemini error {r.status_code}')
        j = r.json(); um = j.get('usageMetadata', {})
        try:
            text = j['candidates'][0]['content']['parts'][0]['text']
        except (KeyError, IndexError):
            raise AIError('Gemini returned no answer')
        return parse_json(text), dict(model=model, input_tokens=um.get('promptTokenCount', 0), output_tokens=um.get('candidatesTokenCount', 0), cost_usd=0)


class OllamaProvider(Provider):
    """Any model served by Ollama on this computer or a server (free, private). PDFs are sent as page images."""
    needs_attachments_as = ('image/', 'application/pdf')

    def available(self):
        ok, why = super().available()
        if not ok: return ok, why
        try:
            httpx.get(self.cfg.get('url', 'http://localhost:11434') + '/api/tags', timeout=2)
            return True, 'ready'
        except Exception:
            return False, 'Ollama is not running'

    def ping(self):
        tags = httpx.get(self.cfg.get('url', 'http://localhost:11434') + '/api/tags', timeout=5).json().get('models', [])
        names = {m.get('name') for m in tags} | {m.get('name', '').split(':')[0] for m in tags}
        if self.cfg['model'] in names or self.cfg['model'].split(':')[0] in names: return True, f"Ollama is running and has {self.cfg['model']}"
        return False, f"Ollama is running but {self.cfg['model']} is not installed (run: ollama pull {self.cfg['model']})"

    def run(self, task, input, attachments):
        self.check_attachments(attachments)
        images = []
        for a in attachments:
            if a.mime == 'application/pdf':
                import pymupdf
                doc = pymupdf.open(stream=a.data, filetype='pdf')
                images += [base64.standard_b64encode(p.get_pixmap(dpi=110).tobytes('png')).decode() for p in list(doc)[:4]]
            else:
                images.append(base64.standard_b64encode(a.data).decode())
        msg = {'role': 'user', 'content': task.user(input) + '\n\n' + schema_hint(task.schema)}
        if images: msg['images'] = images
        r = httpx.post(self.cfg.get('url', 'http://localhost:11434') + '/api/chat', timeout=self.cfg.get('timeout', 600),
                       json={'model': self.cfg['model'], 'stream': False, 'format': task.schema, 'options': {'temperature': 0},
                             'messages': [{'role': 'system', 'content': task.system()}, msg]})
        if r.status_code != 200: raise AIError(f'Ollama error {r.status_code}: {r.text[:120]}')
        j = r.json()
        return parse_json(j.get('message', {}).get('content', '')), dict(model=self.cfg['model'], input_tokens=j.get('prompt_eval_count', 0),
                                                                          output_tokens=j.get('eval_count', 0), cost_usd=0)


class HttpModelProvider(Provider):
    """Your own model (for example a trained ML model) behind a web address.

    Request:  POST <url>  {"task": "<task name>", "input": {...}, "attachments": [{"name", "mime", "data_base64"}]}
    Response: the task's output JSON (see app/ai/tasks.py for each schema). Optional header: Authorization: Bearer $<token_env>.
    `tasks` in the provider config limits which tasks it is asked to do.
    """
    def ping(self):
        try:
            r = httpx.get(self.cfg['url'], timeout=5)
            return True, f'Server answered at {self.cfg["url"]} (status {r.status_code})'
        except httpx.HTTPError:
            return False, f'Nothing is answering at {self.cfg["url"]}'

    def run(self, task, input, attachments):
        allowed = self.cfg.get('tasks')
        if allowed and task.name not in allowed: raise Unsupported('not set up for this task')
        headers = {}
        if self.cfg.get('token_env') and os.environ.get(self.cfg['token_env']): headers['Authorization'] = f"Bearer {os.environ[self.cfg['token_env']]}"
        body = {'task': task.name, 'input': input,
                'attachments': [{'name': a.name, 'mime': a.mime, 'data_base64': base64.standard_b64encode(a.data).decode()} for a in attachments]}
        try:
            r = httpx.post(self.cfg['url'], json=body, headers=headers, timeout=self.cfg.get('timeout', 120))
        except httpx.HTTPError as e:
            raise AIError(f'could not reach {self.cfg["url"]}: {e.__class__.__name__}')
        if r.status_code != 200: raise AIError(f'model server answered {r.status_code}')
        return r.json(), dict(model=self.cfg.get('model', self.name), cost_usd=self.cfg.get('cost_per_call', 0))


class GroqWhisperProvider(Provider):
    def ping(self):
        r = httpx.get('https://api.groq.com/openai/v1/models', headers={'Authorization': f"Bearer {os.environ[self.cfg.get('needs_env', 'GROQ_API_KEY')]}"}, timeout=20)
        if r.status_code == 200: return True, 'Key works'
        if r.status_code in (401, 403): return False, 'The Groq key was not accepted. Check GROQ_API_KEY in .env'
        return False, f'Groq answered with error {r.status_code}'

    def run(self, task, input, attachments):
        if task.name != 'transcribe' or not attachments: raise Unsupported('speech-to-text only')
        a = attachments[0]
        r = httpx.post('https://api.groq.com/openai/v1/audio/transcriptions', headers={'Authorization': f"Bearer {os.environ[self.cfg.get('needs_env', 'GROQ_API_KEY')]}"},
                       files={'file': (a.name, a.data)}, data={'model': self.cfg.get('model', 'whisper-large-v3'), 'response_format': 'verbose_json'},
                       timeout=self.cfg.get('timeout', 600))
        if r.status_code != 200: raise AIError(f'Groq error {r.status_code}')
        j = r.json()
        segs = [dict(start=float(s['start']), end=float(s['end']), text=s['text'].strip()) for s in j.get('segments', [])]
        return dict(text=j.get('text', '').strip(), language=j.get('language'), segments=segs), dict(model=self.cfg.get('model'), cost_usd=0)


_whisper = {}


class LocalWhisperProvider(Provider):
    """faster-whisper on this computer: free and private. The first run downloads the model (base is about 150 MB)."""
    def available(self):
        ok, why = super().available()
        if not ok: return ok, why
        import importlib.util
        return (True, 'ready') if importlib.util.find_spec('faster_whisper') else (False, 'faster-whisper is not installed')

    def ping(self):
        from huggingface_hub import try_to_load_from_cache
        size = self.cfg.get('model', 'base')
        hit = try_to_load_from_cache(f'Systran/faster-whisper-{size}', 'model.bin')
        return (True, f'Whisper {size} is downloaded and ready (free, on this computer)') if isinstance(hit, str) else                (True, f'Whisper {size} will download (~145 MB for base) the first time a recording is transcribed')

    def run(self, task, input, attachments):
        if task.name != 'transcribe' or not attachments: raise Unsupported('speech-to-text only')
        from faster_whisper import WhisperModel
        size = self.cfg.get('model', 'base')
        if size not in _whisper: _whisper[size] = WhisperModel(size, device=self.cfg.get('device', 'cpu'), compute_type=self.cfg.get('compute_type', 'int8'))
        a = attachments[0]
        with tempfile.NamedTemporaryFile(suffix=Path(a.name).suffix or '.audio', delete=False) as tf:
            tf.write(a.data); tmp = tf.name
        try:
            segs, info = _whisper[size].transcribe(tmp, vad_filter=True, language=input.get('language'))
            segs = [dict(start=round(s.start, 1), end=round(s.end, 1), text=s.text.strip()) for s in segs]
        finally:
            os.unlink(tmp)
        return dict(text=' '.join(s['text'] for s in segs), language=info.language, segments=segs), dict(model=f'whisper-{size} (local)', cost_usd=0)
