"""Sending the visit report (PDF) and the voice message to a teacher on WhatsApp.

Two ways, chosen automatically:
  * WhatsApp Business Cloud API (Meta). Needs WHATSAPP_TOKEN (access token) and WHATSAPP_PHONE_ID (the sending number's id) in the host settings. The PDF and the voice message
    are then delivered straight to the teacher's chat when the CRP presses the WhatsApp button. Meta only allows a business to start a chat with an approved message template, so
    set WHATSAPP_TEMPLATE (the template's name; WHATSAPP_TEMPLATE_LANG, default en) as well: it is sent when the teacher has not written to the number in the last 24 hours, and
    the files follow once the teacher replies. (Without a template, files only arrive when the teacher has written to the business number in the last 24 hours.)
  * Without those settings the app opens WhatsApp with the chat ready (wa.me link): a friendly message with the safe links to the PDF and the voice message is already typed, and the
    CRP only presses send in WhatsApp. Nothing is lost: the report is also in the teacher app.
"""
import os, re, urllib.parse

import httpx

GRAPH = 'https://graph.facebook.com/v21.0'


def configured() -> bool:
    return bool(os.environ.get('WHATSAPP_TOKEN') and os.environ.get('WHATSAPP_PHONE_ID'))


def normalize(phone: str | None) -> str | None:
    """Digits with country code (India by default): 9876543210, 09876543210, +91 98765 43210 all become 919876543210. None if it cannot be a phone number."""
    d = re.sub(r'\D', '', phone or '')
    if len(d) == 11 and d.startswith('0'): d = d[1:]
    if len(d) == 10: d = '91' + d
    return d if 11 <= len(d) <= 15 else None


def chat_link(phone: str, text: str) -> str:
    return f'https://wa.me/{phone}?text={urllib.parse.quote(text)}'


def _headers():
    return {'Authorization': f"Bearer {os.environ['WHATSAPP_TOKEN']}"}


def _upload(name: str, data: bytes, mime: str) -> str:
    r = httpx.post(f"{GRAPH}/{os.environ['WHATSAPP_PHONE_ID']}/media", headers=_headers(), data={'messaging_product': 'whatsapp', 'type': mime}, files={'file': (name, data, mime)}, timeout=60)
    r.raise_for_status()
    return r.json()['id']


def _post(payload: dict):
    r = httpx.post(f"{GRAPH}/{os.environ['WHATSAPP_PHONE_ID']}/messages", headers=_headers(), json=dict(messaging_product='whatsapp', **payload), timeout=40)
    return r


def send(to: str, caption: str, pdf: tuple[str, bytes] | None, audio: tuple[str, bytes] | None, teacher_name: str = '') -> tuple[str, str]:
    """('sent' | 'template_sent' | 'failed', plain message). Never raises."""
    try:
        sent = []
        closed = False
        if pdf:
            r = _post(dict(to=to, type='document', document=dict(id=_upload(pdf[0], pdf[1], 'application/pdf'), filename=pdf[0], caption=caption[:900])))
            if r.status_code == 200: sent.append('report')
            else: closed = _is_closed_window(r)
        if audio and not closed:
            r = _post(dict(to=to, type='audio', audio=dict(id=_upload(audio[0], audio[1], 'audio/mpeg'))))
            if r.status_code == 200: sent.append('voice message')
            else: closed = closed or _is_closed_window(r)
        if closed and os.environ.get('WHATSAPP_TEMPLATE'):
            r = _post(dict(to=to, type='template', template=dict(name=os.environ['WHATSAPP_TEMPLATE'], language=dict(code=os.environ.get('WHATSAPP_TEMPLATE_LANG', 'en')),
                                                                 components=[dict(type='body', parameters=[dict(type='text', text=(teacher_name or 'Teacher')[:60])])])))
            if r.status_code == 200: return 'template_sent', 'WhatsApp only lets us start a chat with an approved message. That message was sent; the report and the voice message follow when the teacher replies.'
        if closed:
            return 'failed', 'The teacher has not written to the WhatsApp number in the last 24 hours, so WhatsApp did not allow the files. Set up a message template (see HANDOVER) or use the chat link.'
        if sent: return 'sent', 'Sent on WhatsApp: ' + ' and '.join(sent) + '.'
        return 'failed', 'WhatsApp did not accept the message.'
    except Exception as e:
        return 'failed', f'WhatsApp could not be reached ({str(e)[:100]}).'


def _is_closed_window(r) -> bool:
    try:
        code = (r.json().get('error') or {}).get('code')
    except Exception:
        code = None
    return code in (131047, 131026, 131030)          # re-engagement / message undeliverable / number not allowed to receive


def assign_demo_numbers(conn) -> int:
    """For the demo cluster: the numbers in DEMO_WHATSAPP_NUMBERS (comma separated, kept in the host settings and never in the repository) are given to a few teachers who have no number yet,
    spread over the schools. Safe to run on every start: a number that is already in use is skipped."""
    nums = [n for n in (normalize(x) for x in (os.environ.get('DEMO_WHATSAPP_NUMBERS') or '').split(',')) if n]
    if not nums: return 0
    used = {r['phone'] for r in conn.execute('select phone from teachers where phone is not null').fetchall()}
    todo = [n for n in nums if n not in used]
    if not todo: return 0
    rows = conn.execute("select id from teachers where is_active and phone is null order by md5(teacher_code) limit %s", (len(todo),)).fetchall()
    for r, n in zip(rows, todo):
        conn.execute('update teachers set phone = %s where id = %s', (n, r['id']))
    conn.commit()
    return min(len(rows), len(todo))
