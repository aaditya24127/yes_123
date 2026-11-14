'use client';
// Results step: what the CRP gives the teacher after the visit, in one card. The teacher gets a LINK in the chat of the teacher app (and by email if given). The link opens a page where the
// teacher chooses a language and then the written report or the CRP's short voice message (app/r/page.tsx). The CRP picks the language to start in, can see exactly what the teacher will see,
// listen to the voice message, copy the link and download the English PDF.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Download, Eye, FileText, RefreshCw, Send, Volume2 } from 'lucide-react';
import ExtLink from '@/components/ui/ExtLink';
import { Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { LANGS, useLang } from '@/lib/i18n';
import { apiUrl } from '@/lib/platform';
import type { Session, VoiceInfo } from '@/lib/types';
import { fmtDay } from '@/lib/visit-text';

export default function TeacherReportCard({ s, setError, onSent }: { s: Session; setError: (e: string) => void; onSent: () => void }) {
  const { lang, tr } = useLang();
  const name = s.brief.teacher?.name ?? 'the teacher';
  const [language, setLanguage] = useState<string>(lang);                   // the language the teacher's page starts in; starts as the language of the app
  const [voice, setVoice] = useState<VoiceInfo | null>(s.voice && s.voice.language === lang ? s.voice : null);
  const [making, setMaking] = useState(false);
  const [email, setEmail] = useState(s.brief.teacher?.email ?? '');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; link?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);
  useEffect(() => { setEmail(s.brief.teacher?.email ?? ''); }, [s.brief.teacher?.email]);

  const make = useCallback(async () => {
    if (!s.teacher_id) return;
    const id = ++seq.current; setMaking(true);
    try { const v = await api.visits.voice(s.id, language); if (id === seq.current) setVoice(v); }
    catch (e) { if (id === seq.current) setError((e as Error).message); }
    finally { if (id === seq.current) setMaking(false); }
  }, [s.id, s.teacher_id, language, setError]);

  // The voice message is made while the CRP reads the results, so it is ready for the preview. A saved one in the same language is reused.
  useEffect(() => {
    if (s.voice && s.voice.language === language) { setVoice(s.voice); return; }
    setVoice(null); void make();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const preview = async () => {
    const w = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;     // opened at the tap so the browser does not block it
    try { const r = await api.visits.reportLink(s.id, language, window.location.origin); if (w) w.location.href = r.link; }
    catch (e) { w?.close(); setError((e as Error).message); }
  };

  const copy = async () => {
    try {
      const r = await api.visits.reportLink(s.id, language, window.location.origin);
      try { await navigator.clipboard.writeText(r.link); } catch { window.prompt(tr('Copy this link'), r.link); }
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch (e) { setError((e as Error).message); }
  };

  const send = async () => {
    setSending(true); setResult(null);
    try {
      const r = await api.visits.sendReport(s.id, { email: email.trim(), language, origin: window.location.origin });
      setResult({ text: r.email === 'sent' ? tr('The link is in the teacher\'s chat, and was emailed to {to}.', { to: r.to }) : r.email === 'failed' ? tr('The link is in the teacher\'s chat. {message}', { message: r.message }) : r.email === 'not_set_up' ? tr('The link is in the teacher\'s chat. Email is not switched on yet, so no email went out.') : tr('The link is in the teacher\'s chat.'), link: r.link });
      onSent();
    } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  };

  if (!s.teacher_id) return (
    <Card tour="res-report" title={<span className="flex items-center gap-2"><FileText size={18} className="text-brand-600" />{tr('Report')}</span>}>
      <p className="text-sm text-ink-500">{tr('This visit was for the whole school. Visit one teacher to send a report and a voice message.')}</p>
      <div className="mt-3 flex flex-wrap gap-2"><ExtLink href={api.visits.reportUrl(s.id)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><Eye size={16} />{tr('Open the report')}</ExtLink></div>
    </Card>
  );

  const langInfo = LANGS.find((l) => l.code === language);
  return (
    <Card tour="res-report" title={<span className="flex items-center gap-2"><FileText size={18} className="text-brand-600" />{tr('Report for {name}', { name })}</span>}
      subtitle={tr('The teacher gets a link. It opens a page where they choose their language, then the report or your short voice message.')}>
      <Field label={tr('Language to start in')} hint={language === 'or' ? tr('There is no Odia voice yet, so the voice message is spoken in Hindi. The teacher can change the language on the page.') : tr('The teacher can change the language on the page. Both the report and the voice message follow it.')}>
        <Select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <option key={l.code} value={l.code}>{tr(l.native)}{l.code !== 'en' ? ` (${l.english})` : ''}</option>)}</Select>
      </Field>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button icon={<Eye size={16} />} onClick={preview}>{tr('See what the teacher will see')}</Button>
        <Button variant="soft" icon={<Copy size={16} />} onClick={copy}>{copied ? tr('Link copied') : tr('Copy link')}</Button>
        <ExtLink href={api.visits.reportUrl(s.id, true)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"><Download size={16} />{tr('Download PDF (English)')}</ExtLink>
      </div>

      <div data-tour="res-voice" className="mt-4 rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Volume2 size={18} className="text-brand-600" />{tr('Voice message to {name}', { name })}</p>
          {voice && <span className="text-xs text-ink-500">{voice.gender === 'male' ? tr('{n} seconds · male voice', { n: voice.seconds }) : tr('{n} seconds · female voice', { n: voice.seconds })}</span>}
        </div>
        <div className="mt-3">
          {making && <Spinner label={tr('Recording a short voice message in {language}… about 10 seconds', { language: langInfo?.english ?? 'English' })} />}
          {!making && voice && (
            <>
              <audio key={voice.url} controls preload="metadata" src={apiUrl(voice.url)} className="h-11 w-full" />
              <details className="mt-2"><summary className="-my-1 cursor-pointer py-1 text-sm font-semibold text-brand-700">{tr('Read what the voice says')}</summary><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{voice.script}</p></details>
              <div className="mt-1"><Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void make()}>{tr('Make it again')}</Button></div>
            </>
          )}
          {!making && !voice && <Button variant="soft" icon={<Volume2 size={16} />} onClick={() => void make()}>{tr('Make the voice message')}</Button>}
        </div>
      </div>

      <div className="mt-4 border-t border-brand-100 pt-4">
        <p className="mb-2 text-sm font-semibold text-ink-900">{tr('Send to {name}', { name })}</p>
        <Field label={tr('Email (optional)')} hint={tr('The link is always sent in the teacher\'s chat in the teacher app, with an alert.')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr('teacher@example.com')} /></Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button data-tour="res-send" icon={<Send size={16} />} busy={sending} disabled={sending} onClick={send}>{email.trim() ? tr('Send link in chat and email') : tr('Send link in chat')}</Button>
        </div>
        {result && (
          <p role="status" className="mt-2 text-sm text-emerald-700">{result.text}{result.link && <> <a href={result.link} target="_blank" rel="noreferrer" className="font-semibold underline">{tr('Open the link')}</a></>}</p>
        )}
        {!result && s.report_sent_at && <p className="mt-2 text-xs text-ink-500">{tr('Last sent on {fmtDay}.', { fmtDay: fmtDay(s.report_sent_at) })}</p>}
      </div>
    </Card>
  );
}
