"""Runs an AI task by trying the providers listed for it in config/ai.json, in order.

    from app import ai
    out = ai.run('extract_records', {...input...}, attachments=[ai.Attachment(name, mime, data)])
    out.data      -> the answer, already checked against the task's schema
    out.provider  -> which provider answered (stored with the records, so you can see what made them)

A provider is skipped when it is switched off, its key is missing, it cannot do this task (e.g. no image support), or its
answer fails the schema check. If every provider fails, AIUnavailable is raised and the caller uses its own fallback.
"""
import json, os, time
from dataclasses import dataclass, field
from pathlib import Path

import jsonschema

from .tasks import TASKS

CONFIG_PATH = Path(os.environ.get('AI_CONFIG') or Path(__file__).resolve().parents[3] / 'config' / 'ai.json')


class AIError(RuntimeError):
    """A single provider failed (the registry moves on to the next one)."""


class Unsupported(AIError):
    """The provider cannot do this task / input (not an error worth logging)."""


class AIUnavailable(RuntimeError):
    """No provider could do the task."""
    def __init__(self, task, tried):
        self.task, self.tried = task, tried
        super().__init__(f"No AI could do '{task}': " + '; '.join(f'{p}: {r}' for p, r in tried) if tried else f"No AI configured for '{task}'")


@dataclass
class Attachment:
    name: str
    mime: str
    data: bytes


@dataclass
class Result:
    data: dict
    provider: str
    model: str | None = None
    tried: list = field(default_factory=list)


_cache = {'mtime': None, 'cfg': None, 'providers': {}}


ENV_PATH = CONFIG_PATH.parents[1] / '.env'


def _reload_env():
    """Keys pasted into .env take effect without restarting the server."""
    mt = ENV_PATH.stat().st_mtime if ENV_PATH.is_file() else 0
    if _cache.get('env_mtime') != mt:
        from dotenv import dotenv_values
        mine = _cache.setdefault('env_keys', set())          # keys this file set earlier
        values = dotenv_values(ENV_PATH) if mt else {}
        for k, v in values.items():
            if k == 'TARGET' or k.startswith(('DATABASE_', 'SUPABASE_', 'STORAGE_')): continue   # where data lives never changes while running (a test started with TARGET=local must stay local)
            if k.startswith('AI_') and k in os.environ and k not in mine: continue                # settings given when the program started win
            if v:                                             # only filled-in lines; a blank never hides a key set elsewhere (e.g. on the server)
                os.environ[k] = v; mine.add(k)
            elif k in mine:                                   # a key was deleted from .env: forget it
                os.environ.pop(k, None); mine.discard(k)
        _cache['env_mtime'] = mt
        _cache['providers'] = {}


def config():
    """Reads config/ai.json (re-read automatically when the file changes) and applies AI_* environment overrides."""
    _reload_env()
    mt = CONFIG_PATH.stat().st_mtime if CONFIG_PATH.is_file() else 0
    if _cache['mtime'] != mt:
        cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8')) if mt else {'providers': {'rules': {'type': 'rules'}}, 'tasks': {}}
        _cache.update(mtime=mt, cfg=cfg, providers={})
    cfg = json.loads(json.dumps(_cache['cfg']))
    for k, v in os.environ.items():
        if k.startswith('AI_TASK_'):
            cfg['tasks'][k[8:].lower()] = [x.strip() for x in v.split(',') if x.strip()]
        elif k.startswith('AI_PROVIDER_'):
            for name in cfg['providers']:
                pre = f'AI_PROVIDER_{name.upper()}_'
                if k.startswith(pre):
                    field_ = k[len(pre):].lower()
                    val = v if field_ not in ('enabled',) else v.lower() in ('1', 'true', 'yes')
                    cfg['providers'][name][field_] = val
    return cfg


def provider(name):
    from . import providers
    cfg = config()
    pc = cfg['providers'].get(name)
    if pc is None: raise Unsupported(f'unknown provider {name}')
    key = (name, json.dumps(pc, sort_keys=True))
    p = _cache['providers'].get(key)
    if p is None:
        cls = providers.TYPES.get(pc.get('type'))
        if not cls: raise Unsupported(f"unknown provider type {pc.get('type')}")
        p = _cache['providers'][key] = cls(name, pc)
    return p


def chain(task):
    cfg = config()
    names = cfg['tasks'].get(task) or ['rules']
    return names


def is_free(name):
    """A provider that costs nothing per call (no price in config/ai.json): Groq, Gemini free tier, Ollama, the free rules."""
    pc = config()['providers'].get(name) or {}
    return not any(pc.get('price_per_mtok') or [0])


def order(task, mode=None):
    """The providers to try, in order. mode: None / 'auto' = as listed in config/ai.json (Claude first, then the free models);
    'claude' = Claude models first; 'free' = the free models first (Claude only if they all fail). `rules` is always last."""
    names = list(chain(task))
    if mode not in ('claude', 'free'): return names
    kind = lambda n: (config()['providers'].get(n) or {}).get('type')
    last = [n for n in names if n == 'rules']
    rest = [n for n in names if n != 'rules']
    first = [n for n in rest if (kind(n) == 'claude' if mode == 'claude' else is_free(n))]
    return first + [n for n in rest if n not in first] + last


def run(task, input, attachments=None, only=None, mode=None):
    t = TASKS[task]
    tried = []
    for name in ([only] if only else order(task, mode)):
        try:
            p = provider(name)
            ok, why = p.available()
            if not ok: tried.append((name, why)); continue
            if over_budget(p): tried.append((name, 'AI_BUDGET_USD reached')); continue
            t0 = time.time()
            out, usage = p.run(t, input, attachments or [])
            jsonschema.validate(out, t.schema)
            _log(task, name, usage, True, None, time.time() - t0)
            return Result(out, name, usage.get('model'), tried)
        except Unsupported as e:
            tried.append((name, str(e)))
        except jsonschema.ValidationError as e:
            _log(task, name, {}, False, f'answer did not match the expected format: {e.message[:200]}', 0)
            tried.append((name, 'answer did not match the expected format'))
        except Exception as e:      # any provider failure: try the next one
            _log(task, name, {}, False, str(e)[:300], 0)
            tried.append((name, str(e)[:160]))
    raise AIUnavailable(task, tried)


def status():
    """What is configured and usable, for the settings screen."""
    cfg = config(); out = {'providers': {}, 'tasks': {}}
    for name in cfg['providers']:
        try:
            p = provider(name); ok, why = p.available()
            out['providers'][name] = dict(type=cfg['providers'][name].get('type'), model=cfg['providers'][name].get('model'), available=ok, reason=why,
                                          note=cfg['providers'][name].get('note'))
        except Exception as e:
            out['providers'][name] = dict(available=False, reason=str(e))
    for task, names in cfg['tasks'].items():
        first = next((n for n in names if out['providers'].get(n, {}).get('available')), None)
        out['tasks'][task] = dict(chain=names, will_use=first, description=TASKS[task].description if task in TASKS else '')
    return out


def spent_usd():
    from ..services.prioritization.data import get_conn
    with get_conn() as c:
        return float(c.execute('select coalesce(sum(cost_usd), 0) as s from llm_calls').fetchone()['s'])


def over_budget(p):
    """Paid providers stop being used once the logged AI cost reaches AI_BUDGET_USD (free ones keep working)."""
    cap = os.environ.get('AI_BUDGET_USD', '').strip()
    if not cap or not any(p.cfg.get('price_per_mtok') or [0]): return False
    try:
        return spent_usd() >= float(cap)
    except Exception:
        return False


def test_all():
    """Checks every switched-on provider with a free call (no AI credit is spent): key valid, model reachable."""
    out = {}
    for name in config()['providers']:
        try:
            p = provider(name); ok, why = p.available()
            if not ok:
                out[name] = dict(ok=None, message=f'Not in use: {why}'); continue
            good, msg = p.ping()
            out[name] = dict(ok=good, message=msg)
        except Exception as e:
            out[name] = dict(ok=False, message=str(e)[:200])
    return out


def _log(task, provider_name, usage, ok, err, secs):
    try:
        from ..services.prioritization.data import get_conn
        with get_conn() as c:
            c.execute('insert into llm_calls (task, provider, model, input_tokens, output_tokens, cost_usd, ok, error, seconds) values (%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                      (task, provider_name, usage.get('model') or '-', usage.get('input_tokens', 0), usage.get('output_tokens', 0), usage.get('cost_usd', 0), ok,
                       (err or '')[:500], round(secs, 2)))
    except Exception:
        pass    # logging must never break a feature
