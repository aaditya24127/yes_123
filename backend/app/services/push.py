"""Web Push to the teachers' phones and browsers (standard Web Push with VAPID keys; no Firebase account needed).

Settings (.env / Render): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: address). Without them push is simply off and the
app still works (it refreshes every few seconds while open). The private key never leaves the server; the public key is served to the
teacher app so the browser can subscribe.
"""
import json, os, threading

from .prioritization.data import get_conn

MAX_FAILURES = 5


def configured() -> bool:
    return bool(os.environ.get('VAPID_PUBLIC_KEY') and os.environ.get('VAPID_PRIVATE_KEY'))


def public_key() -> str | None:
    return os.environ.get('VAPID_PUBLIC_KEY') or None


def save_subscription(conn, teacher_id, endpoint, p256dh, auth, user_agent=None):
    conn.execute("""insert into push_subscriptions (teacher_id, endpoint, p256dh, auth, user_agent) values (%s,%s,%s,%s,%s)
                    on conflict (endpoint) do update set teacher_id = excluded.teacher_id, p256dh = excluded.p256dh, auth = excluded.auth,
                    user_agent = excluded.user_agent, failures = 0""", (teacher_id, endpoint, p256dh, auth, (user_agent or '')[:300]))
    conn.commit()


def remove_subscription(conn, teacher_id, endpoint):
    conn.execute('delete from push_subscriptions where endpoint = %s and teacher_id = %s', (endpoint, teacher_id))
    conn.commit()


def count_for(conn, teacher_id) -> int:
    return conn.execute('select count(*) n from push_subscriptions where teacher_id = %s', (teacher_id,)).fetchone()['n']


def _send_all(teacher_id, title, body, url):
    from pywebpush import WebPushException, webpush
    payload = json.dumps(dict(title=title, body=body or '', url=url or '/'))
    with get_conn() as conn:
        subs = conn.execute('select id, endpoint, p256dh, auth from push_subscriptions where teacher_id = %s', (teacher_id,)).fetchall()
        for s in subs:
            try:
                webpush(subscription_info=dict(endpoint=s['endpoint'], keys=dict(p256dh=s['p256dh'], auth=s['auth'])), data=payload, ttl=86400,
                        vapid_private_key=os.environ['VAPID_PRIVATE_KEY'], vapid_claims={'sub': os.environ.get('VAPID_SUBJECT', 'mailto:admin@example.com')})
                conn.execute('update push_subscriptions set last_ok = now(), failures = 0 where id = %s', (s['id'],))
            except WebPushException as e:
                code = getattr(getattr(e, 'response', None), 'status_code', None)
                if code in (404, 410):          # the device removed the subscription: forget it
                    conn.execute('delete from push_subscriptions where id = %s', (s['id'],))
                else:
                    conn.execute('update push_subscriptions set failures = failures + 1 where id = %s', (s['id'],))
                    conn.execute('delete from push_subscriptions where id = %s and failures >= %s', (s['id'], MAX_FAILURES))
            except Exception:
                conn.execute('update push_subscriptions set failures = failures + 1 where id = %s', (s['id'],))
        conn.commit()


def notify_teacher(teacher_id, title, body=None, url='/', wait=False):
    """Push a notification to every device of this teacher. Runs in the background so the request that triggered it is never slowed down."""
    if not configured(): return
    def run():
        try:
            _send_all(str(teacher_id), title, body, url)
        except Exception:
            pass
    if wait: run()
    else: threading.Thread(target=run, daemon=True).start()
