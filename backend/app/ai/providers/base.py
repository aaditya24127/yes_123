"""What every AI provider looks like. To add a new kind of AI, subclass Provider, implement run(), and register the class in
providers/__init__.py under a new `type` name; then reference it from config/ai.json."""
import json, os, re

from ..registry import Unsupported, AIError


class Provider:
    needs_attachments_as = ()          # mime prefixes this provider can read, e.g. ('image/', 'application/pdf')

    def __init__(self, name, cfg):
        self.name, self.cfg = name, cfg

    def available(self):
        if self.cfg.get('enabled') is False: return False, 'switched off in config/ai.json'
        env = self.cfg.get('needs_env')
        if env and not os.environ.get(env): return False, f'{env} is not set'
        cond = self.cfg.get('enabled_env')
        if cond:
            k, _, v = cond.partition('=')
            if os.environ.get(k, '').lower() != v.lower(): return False, f'set {cond} to use it'
        return True, 'ready'

    def run(self, task, input, attachments):
        """Returns (output dict, usage dict with model/input_tokens/output_tokens/cost_usd)."""
        raise NotImplementedError

    def ping(self):
        """A free check that the key / server works (no AI credit spent). Returns (ok, plain message)."""
        return True, 'Ready (checked when first used)'

    # helpers shared by language-model providers
    def check_attachments(self, attachments):
        for a in attachments:
            if not any(a.mime.startswith(p) for p in self.needs_attachments_as):
                raise Unsupported(f'cannot read {a.mime} files')

    def cost(self, inp, out):
        pi, po = (self.cfg.get('price_per_mtok') or [0, 0])
        return round((inp * pi + out * po) / 1e6, 6)


def parse_json(text):
    """Accepts a bare JSON object or one wrapped in ``` fences / surrounded by prose."""
    text = (text or '').strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.S) or re.search(r'(\{.*\})', text, re.S)
    if not m: raise AIError('answer was not JSON')
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        raise AIError('answer was not valid JSON')


def schema_hint(schema):
    return 'Reply with only one JSON object that matches this JSON Schema:\n' + json.dumps(schema)
