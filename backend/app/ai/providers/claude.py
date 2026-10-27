"""Claude (Anthropic API). Model, effort, price and web search are all set in config/ai.json."""
import base64

from .base import Provider, parse_json
from ..registry import AIError, Unsupported

import os

_clients = {}


def client():
    """One client per key, so a new key pasted into .env is used straight away."""
    key = os.environ.get('ANTHROPIC_API_KEY', '')
    if key not in _clients:
        import anthropic
        _clients.clear(); _clients[key] = anthropic.Anthropic(api_key=key or None, max_retries=3)
    return _clients[key]


class ClaudeProvider(Provider):
    needs_attachments_as = ('image/', 'application/pdf')

    def ping(self):
        import anthropic
        try:
            m = client().models.retrieve(self.cfg['model'])      # free: confirms the key works and this model is available
            return True, f'Key works; {getattr(m, "display_name", None) or self.cfg["model"]} is available'
        except anthropic.AuthenticationError:
            return False, 'The Claude key was not accepted. Check ANTHROPIC_API_KEY in .env'
        except anthropic.NotFoundError:
            return False, f"Model {self.cfg['model']} is not available to this key; change it in config/ai.json"
        except anthropic.PermissionDeniedError:
            return False, 'This key is not allowed to use the API (check billing / workspace in the Claude console)'
        except anthropic.APIConnectionError:
            return False, 'Could not reach Claude (internet connection?)'
        except anthropic.APIStatusError as e:
            return False, f'Claude answered with error {e.status_code}'

    def run(self, task, input, attachments):
        import anthropic
        self.check_attachments(attachments)
        model = self.cfg['model']
        content = []
        for a in attachments:
            b64 = base64.standard_b64encode(a.data).decode()
            if a.mime == 'application/pdf':
                content.append({'type': 'document', 'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': b64}})
            else:
                content.append({'type': 'image', 'source': {'type': 'base64', 'media_type': a.mime, 'data': b64}})
        content.append({'type': 'text', 'text': task.user(input)})
        kw = dict(model=model, max_tokens=self.cfg.get('max_tokens', task.max_tokens),
                  system=[{'type': 'text', 'text': task.system(), 'cache_control': {'type': 'ephemeral'}}],   # stable instructions are cached (cheaper repeats)
                  messages=[{'role': 'user', 'content': content}])
        oc = {}
        if self.cfg.get('effort'): oc['effort'] = self.cfg['effort']
        if self.cfg.get('web_search'):
            tool = {'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': self.cfg.get('max_searches', 4)}
            if self.cfg.get('allowed_domains'): tool['allowed_domains'] = self.cfg['allowed_domains']
            kw['tools'] = [tool]
        else:
            oc['format'] = {'type': 'json_schema', 'schema': task.schema}
        if oc: kw['output_config'] = oc
        try:
            if self.cfg.get('refusal_fallback'):
                # if a safety check declines, the API retries on a suitable fallback model inside the same call
                with client().beta.messages.stream(betas=['server-side-fallback-2026-07-01'], fallbacks='default', **kw) as s:
                    r = s.get_final_message()
            else:
                with client().messages.stream(**kw) as s:
                    r = s.get_final_message()
        except anthropic.BadRequestError as e:
            raise AIError(f'Claude rejected the request: {e.message}')
        except anthropic.AuthenticationError:
            raise AIError('Claude API key is not valid')
        except anthropic.RateLimitError:
            raise AIError('Claude rate limit reached; try again shortly')
        except anthropic.APIStatusError as e:
            raise AIError(f'Claude error {e.status_code}')
        except anthropic.APIConnectionError:
            raise AIError('could not reach Claude (network)')
        if r.stop_reason == 'refusal': raise AIError('Claude declined this request')
        if r.stop_reason == 'max_tokens': raise AIError('answer was cut off (too long)')
        u = r.usage
        inp = (u.input_tokens or 0) + (getattr(u, 'cache_creation_input_tokens', 0) or 0) + (getattr(u, 'cache_read_input_tokens', 0) or 0) // 10
        usage = dict(model=r.model or model, input_tokens=inp, output_tokens=u.output_tokens or 0, cost_usd=self.cost(inp, u.output_tokens or 0))
        text = ''.join(b.text for b in r.content if b.type == 'text')
        return parse_json(text), usage
