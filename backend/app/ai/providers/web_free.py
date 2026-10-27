"""Free textbook search: DuckDuckGo's plain HTML results, limited to official education sites. No key needed.
Best effort (search pages can change); the rules provider's portal links are the fallback."""
import html, re, urllib.parse

import httpx

from .base import Provider
from ..registry import AIError, Unsupported


class WebSearchFreeProvider(Provider):
    def run(self, task, input, attachments):
        if task.name != 'find_textbooks': raise Unsupported('textbook search only')
        doms = self.cfg.get('allowed_domains') or []
        q = ' '.join(x for x in [input['query'], f"class {input['class_no']}" if input.get('class_no') else '', input.get('subject') or '', 'textbook pdf'] if x)
        q += ' (' + ' OR '.join(f'site:{d}' for d in doms) + ')' if doms else ''
        try:
            r = httpx.post('https://html.duckduckgo.com/html/', data={'q': q}, headers={'User-Agent': 'Mozilla/5.0 (CRP Mentor Copilot textbook search)'},
                           timeout=self.cfg.get('timeout', 20), follow_redirects=True)
        except httpx.HTTPError as e:
            raise AIError(f'web search failed: {e.__class__.__name__}')
        if r.status_code != 200: raise AIError(f'web search answered {r.status_code}')
        out, seen = [], set()
        for m in re.finditer(r'<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', r.text, re.S):
            href = html.unescape(m.group(1))
            if 'uddg=' in href: href = urllib.parse.unquote(urllib.parse.parse_qs(urllib.parse.urlparse(href).query).get('uddg', [href])[0])
            host = urllib.parse.urlparse(href).netloc.lower()
            if doms and not any(host == d or host.endswith('.' + d) for d in doms): continue
            if href in seen: continue
            seen.add(href)
            title = re.sub(r'<[^>]+>', '', html.unescape(m.group(2))).strip()
            out.append(dict(title=title[:200], url=href, publisher=host, is_pdf=href.lower().split('?')[0].endswith('.pdf'), class_no=input.get('class_no'),
                            subject=input.get('subject'), language=input.get('language')))
            if len(out) >= 8: break
        if not out: raise AIError('no official results found')
        return dict(results=out), dict(model='duckduckgo-html', cost_usd=0)
