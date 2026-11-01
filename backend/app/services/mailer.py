"""Send an email with an attachment (the visit report) through any normal mail account (SMTP).

Settings (.env / host settings): SMTP_HOST, SMTP_PORT (587 by default; 465 uses SSL), SMTP_USER, SMTP_PASSWORD, SMTP_FROM (defaults to SMTP_USER).
Without them email is simply off: the report still reaches the teacher inside the teacher app.
"""
import os, smtplib, ssl
from email.message import EmailMessage


def configured() -> bool:
    return bool(os.environ.get('SMTP_HOST') and (os.environ.get('SMTP_FROM') or os.environ.get('SMTP_USER')))


def send(to: str, subject: str, body: str, attachments: list[tuple[str, bytes, str]] | None = None) -> tuple[str, str]:
    """Returns ('sent' | 'not_set_up' | 'failed', plain-language message). Never raises."""
    if not configured(): return 'not_set_up', 'Email is not switched on yet.'
    host, port = os.environ['SMTP_HOST'], int(os.environ.get('SMTP_PORT') or 587)
    user, pw = os.environ.get('SMTP_USER'), os.environ.get('SMTP_PASSWORD')
    msg = EmailMessage()
    msg['From'], msg['To'], msg['Subject'] = os.environ.get('SMTP_FROM') or user, to, subject
    msg.set_content(body)
    for name, data, mime in attachments or []:
        main, _, sub = mime.partition('/')
        msg.add_attachment(data, maintype=main, subtype=sub or 'octet-stream', filename=name)
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=25, context=ssl.create_default_context()) as s:
                if user: s.login(user, pw or '')
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=25) as s:
                s.starttls(context=ssl.create_default_context())
                if user: s.login(user, pw or '')
                s.send_message(msg)
        return 'sent', f'Email sent to {to}.'
    except Exception as e:  # wrong password, blocked port, bad address ...
        return 'failed', f'The email could not be sent ({type(e).__name__}). The teacher still has the report in the teacher app.'
