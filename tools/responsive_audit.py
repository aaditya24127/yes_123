"""Responsive audit of the three websites: opens every page at 14 device sizes (small phones, big phones, landscape phones, tablets, laptops) with a real Chrome and measures
what makes a site awkward on a phone: the page scrolling sideways, things sticking out of the screen, tap targets under 32 px, text under 11 px, inputs under 16 px (iPhones zoom in on
them), and console errors. It also saves screenshots of every page at 360, 768 and 1280 px wide and of any page that overflows.

    python tools/responsive_audit.py crp [base_url]        (website, default http://localhost:3000, API on :8000, demo CRP account)
    python tools/responsive_audit.py teacher [base_url]    (teacher app, default http://localhost:3001, demo teacher account)
    python tools/responsive_audit.py landing [base_url]    (landing page, default http://localhost:5173)

Needs Playwright for Python and Chrome (`pip install playwright`). Results: tools/out/responsive/<site>.json and <site>_shots/ (not committed). Prints one line per page and size.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out', 'responsive')
SCHOOL, TEACHER = '559b0369-823e-509c-b019-5501bee76656', 'c424ad79-f33a-5025-8faf-94b5f6926d4b'      # demo school and teacher (same ids on every database made from the seed data)
SIZES = [  # name, width, height, phone-like
    ('phone-320', 320, 640, True), ('phone-360', 360, 740, True), ('phone-375', 375, 812, True), ('phone-390', 390, 844, True), ('phone-414', 414, 896, True), ('phone-480', 480, 900, True),
    ('phone-land-667', 667, 375, True), ('phone-land-844', 844, 390, True), ('tablet-600', 600, 960, True), ('tablet-768', 768, 1024, True), ('tablet-820', 820, 1180, True),
    ('tablet-land-1024', 1024, 768, True), ('laptop-1280', 1280, 800, False), ('desktop-1536', 1536, 864, False),
]
SITES = {
    'crp': dict(base='http://localhost:3000', token='crp-token', pages=[('priorities', '/'), ('upload', '/upload'), ('visit', '/visit'), ('visit-brief', f'/visit?school={SCHOOL}&teacher={TEACHER}'),
                                                                        ('connect', '/connect'), ('ask', '/ask'), ('settings', '/settings'), ('login', '/login')]),
    'teacher': dict(base='http://localhost:3001', token='crp-teacher-token', pages=[('home', '/'), ('messages', '/messages'), ('visits', '/visits'), ('account', '/account'), ('updates', '/updates'), ('login', '/login')]),
    'landing': dict(base='http://localhost:5173', token=None, pages=[('landing', '/')]),
}

# What is measured on each page (runs inside the browser).
JS = r"""
() => {
  const W = window.innerWidth, H = window.innerHeight; const out = {};
  const de = document.documentElement;
  out.scrollW = de.scrollWidth; out.innerW = W; out.overflowX = de.scrollWidth - W; out.docH = de.scrollHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'; };
  const label = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + ' "' + (e.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().slice(0, 28).replace(/\n/g, ' ') + '"');
  // inside a box that scrolls or clips sideways on purpose (a row of chips, a wide table), sticking out is fine
  const scrolls = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') { const r = p.getBoundingClientRect(); if (r.right <= W + 1) return true; } } return false; };
  const off = [];
  for (const e of document.body.querySelectorAll('*')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    if (s.position === 'fixed' && r.right <= W + 1) continue;
    if ((r.right > W + 1 || r.left < -1) && !scrolls(e)) off.push({ el: label(e), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
  }
  out.offscreen = off.slice(0, 8); out.offscreenCount = off.length;
  const small = []; let n = 0;
  for (const e of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary')) {
    if (!vis(e)) continue; const r = e.getBoundingClientRect(); n++;
    if (e.tagName === 'A' && getComputedStyle(e).display === 'inline') continue;          // a link inside a sentence
    if (Math.min(r.width, r.height) < 32 || r.height < 30) small.push({ el: label(e), w: Math.round(r.width), h: Math.round(r.height) });
  }
  out.interactive = n; out.smallTargets = small.slice(0, 10); out.smallTargetCount = small.length;
  let tiny = 0; const tinySamples = [];
  for (const e of document.body.querySelectorAll('*')) {
    if (!vis(e) || !e.childNodes.length) continue; let has = false; for (const c of e.childNodes) if (c.nodeType === 3 && c.textContent.trim().length > 2) has = true; if (!has) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11) { tiny++; if (tinySamples.length < 4) tinySamples.push(label(e) + ' ' + fs + 'px'); }
  }
  out.tinyText = tiny; out.tinySamples = tinySamples;
  out.smallInputFont = [...document.querySelectorAll('input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio]), select, textarea')].filter(vis).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length;
  return out;
}
"""


def login(page, site, base):
    page.goto(base + '/login', wait_until='domcontentloaded'); page.wait_for_timeout(1200)
    if site == 'crp':
        page.get_by_text('Fill in the demo account').click(); page.wait_for_timeout(300)
    else:
        page.locator('input[type=email]').fill('vaishali.kulkarni@crp.com'); page.locator('input[type=password]').fill('pass123')
    page.locator('button[type=submit]').click(); page.wait_for_url(lambda u: '/login' not in u, timeout=30000); page.wait_for_timeout(1500)


def signed_in(page, token):
    try: return token in page.evaluate("Object.keys(localStorage).join(',')")
    except Exception: return False


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in SITES: sys.exit(__doc__)
    site = sys.argv[1]; cfg = SITES[site]; base = sys.argv[2] if len(sys.argv) > 2 else cfg['base']
    shots = os.path.join(OUT, f'{site}_shots'); os.makedirs(shots, exist_ok=True)
    res = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        for name, w, h, phone in SIZES:
            ctx = browser.new_context(viewport={'width': w, 'height': h}, is_mobile=phone, has_touch=phone, device_scale_factor=2 if phone else 1)
            page = ctx.new_page(); errors = []
            page.on('console', lambda m: errors.append(m.text[:160]) if m.type == 'error' else None); page.on('pageerror', lambda e: errors.append(('pageerror ' + str(e))[:160]))
            for pname, path in cfg['pages']:
                try:
                    if pname == 'login':
                        page.goto(base + '/', wait_until='domcontentloaded'); page.evaluate('localStorage.clear()')
                    elif cfg['token'] and not signed_in(page, cfg['token']):
                        login(page, site, base)
                    errors.clear(); page.goto(base + path, wait_until='domcontentloaded'); page.wait_for_timeout(4000 if pname in ('visit-brief', 'priorities') else 2500)
                    m = page.evaluate(JS); m.update(size=name, page=pname, errors=list(errors)[:3]); res.append(m)
                    if name in ('phone-360', 'tablet-768', 'laptop-1280') or m['overflowX'] > 1:
                        page.screenshot(path=os.path.join(shots, f'{pname}_{name}.png'), full_page=True)
                    print(f"{name:17} {pname:12} overflowX={m['overflowX']:>4} off={m['offscreenCount']:>3} smallTap={m['smallTargetCount']:>3}/{m['interactive']:<3} tiny={m['tinyText']:>3} inFont<16={m['smallInputFont']} err={len(m['errors'])}", flush=True)
                except Exception as e:
                    print(name, pname, 'ERROR', str(e)[:150], flush=True); res.append(dict(size=name, page=pname, error=str(e)[:200]))
            ctx.close()
        browser.close()
    os.makedirs(OUT, exist_ok=True); json.dump(res, open(os.path.join(OUT, f'{site}.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    bad = [r for r in res if r.get('overflowX', 0) > 1 or r.get('offscreenCount', 0) or r.get('errors')]
    print(f'\n{len(res)} measurements, {len(bad)} with sideways overflow, off-screen elements or console errors.')


if __name__ == '__main__':
    main()
