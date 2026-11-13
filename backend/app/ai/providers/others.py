"""Gemini, Ollama (local models), your own model behind a URL, and speech-to-text providers."""
import base64, io, os, tempfile, time
from pathlib import Path

import httpx

from .base import Provider, parse_json, schema_hint
from ..registry import AIError, Unsupported


GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models'
BUSY = (404, 429, 500, 503)          # retired, rate-limited or overloaded: try the next model in the list


class GeminiProvider(Provider):
    """Google Gemini over plain HTTPS. Reads PDFs, images and audio. The free tier may use inputs for training: demo data only.
    `models` in config/ai.json is a list tried in order, so a retired or overloaded model is skipped automatically."""
    needs_attachments_as = ('image/', 'application/pdf', 'audio/')

    def _models(self): return self.cfg.get('models') or [self.cfg.get('model', 'gemini-flash-latest')]
    def _key(self): return os.environ[self.cfg.get('needs_env', 'GEMINI_API_KEY')]

    def ping(self):
        for model in self._models():
            r = httpx.get(f'{GEMINI}/{model}', params={'key': self._key()}, timeout=20)
            if r.status_code in (400, 401, 403): return False, 'The Gemini key was not accepted. Check GEMINI_API_KEY in .env'
            if r.status_code == 200: return True, f"Key works; will use {', then '.join(self._models())} (first one free and not busy)"
        return False, f"None of these models exist any more: {', '.join(self._models())}; update the list in config/ai.json"

    def run(self, task, input, attachments):
        self.check_attachments(attachments)
        parts = [{'inline_data': {'mime_type': a.mime, 'data': base64.standard_b64encode(a.data).decode()}} for a in attachments]
        parts.append({'text': task.user(input) + '\n\n' + schema_hint(task.schema)})
        body = {'system_instruction': {'parts': [{'text': task.system()}]}, 'contents': [{'role': 'user', 'parts': parts}],
                'generationConfig': {'response_mime_type': 'application/json', 'temperature': 0}}
        last = None
        for model in self._models():
            try:
                r = httpx.post(f'{GEMINI}/{model}:generateContent', params={'key': self._key()}, json=body, timeout=self.cfg.get('timeout', 180))
            except httpx.TimeoutException:
                last = f'{model} timed out'; continue
            if r.status_code in BUSY:
                last = f'{model}: error {r.status_code}'; continue
            if r.status_code != 200: raise AIError(f'Gemini error {r.status_code}')
            j = r.json(); um = j.get('usageMetadata', {})
            try:
                text = j['candidates'][0]['content']['parts'][0]['text']
            except (KeyError, IndexError):
                last = f'{model} gave no answer'; continue
            return parse_json(text), dict(model=j.get('modelVersion') or model, input_tokens=um.get('promptTokenCount', 0),
                                          output_tokens=um.get('candidatesTokenCount', 0), cost_usd=0)
        raise AIError(f'All Gemini models busy or unavailable ({last})')


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


GROQ_MAX_BYTES = 24 * 1024 * 1024        # the speech service refuses bigger files


def _shrink_audio(data: bytes, name: str) -> bytes:
    """Long or high-quality phone recordings can be bigger than the speech service accepts. Speech needs very little quality, so it is
    re-packed as a small mono file (a 2 hour recording is then about 29 MB). Needs ffmpeg (bundled with imageio-ffmpeg, or on the computer)."""
    import shutil, subprocess, tempfile
    exe = shutil.which('ffmpeg')
    if not exe:
        try:
            import imageio_ffmpeg
            exe = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            raise AIError('This recording is too big to read and the audio converter is not installed. Please record in shorter parts.')
    with tempfile.TemporaryDirectory() as d:
        src = os.path.join(d, 'in' + (os.path.splitext(name)[1] or '.bin')); out = os.path.join(d, 'out.mp3')
        open(src, 'wb').write(data)
        r = subprocess.run([exe, '-y', '-loglevel', 'error', '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', out], capture_output=True, timeout=600)
        if r.returncode != 0 or not os.path.exists(out): raise AIError('This recording could not be converted for reading.')
        return open(out, 'rb').read()


class GroqWhisperProvider(Provider):
    def ping(self):
        r = httpx.get('https://api.groq.com/openai/v1/models', headers={'Authorization': f"Bearer {os.environ[self.cfg.get('needs_env', 'GROQ_API_KEY')]}"}, timeout=20)
        if r.status_code == 200: return True, 'Key works'
        if r.status_code in (401, 403): return False, 'The Groq key was not accepted. Check GROQ_API_KEY in .env'
        return False, f'Groq answered with error {r.status_code}'

    def run(self, task, input, attachments):
        if task.name != 'transcribe' or not attachments: raise Unsupported('speech-to-text only')
        a = attachments[0]
        if len(a.data) > GROQ_MAX_BYTES:
            small = _shrink_audio(a.data, a.name)
            if len(small) > GROQ_MAX_BYTES: raise AIError('This recording is too long to read in one go. Please record in parts of up to about 2 hours.')
            a = type(a)(os.path.splitext(a.name)[0] + '.mp3', 'audio/mpeg', small)
        r = httpx.post('https://api.groq.com/openai/v1/audio/transcriptions', headers={'Authorization': f"Bearer {os.environ[self.cfg.get('needs_env', 'GROQ_API_KEY')]}"},
                       files={'file': (a.name, a.data)}, data={'model': self.cfg.get('model', 'whisper-large-v3'), 'response_format': 'verbose_json'},
                       timeout=self.cfg.get('timeout', 600))
        if r.status_code != 200: raise AIError(f'Groq error {r.status_code}')
        j = r.json()
        # Whisper invents words ("you", "Thank you") over silence or noise. It also says how sure it is that a stretch has no speech: drop those.
        real = [s for s in j.get('segments', []) if not (s.get('no_speech_prob', 0) > 0.6 and s.get('avg_logprob', 0) < -0.6) and s.get('compression_ratio', 0) < 2.4]
        segs = [dict(start=float(s['start']), end=float(s['end']), text=s['text'].strip()) for s in real if s['text'].strip()]
        if j.get('segments') is not None:
            return dict(text=' '.join(x['text'] for x in segs).strip(), language=j.get('language'), segments=segs), dict(model=self.cfg.get('model'), cost_usd=0)
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
