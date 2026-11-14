'use client';
// Results step: everything the CRP gives the teacher after the visit, in one card: the PDF report, a short voice message in the teacher's language (made while the CRP reads the
// results, so it is ready), and the ways to send both: the teacher app (with an alert), email, and WhatsApp.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, RefreshCw, Send, Volume2 } from 'lucide-react';
import ExtLink from '@/components/ui/ExtLink';
import { Button, Card, Field, Input, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { refreshDirectory } from '@/lib/hooks';
import { LANGS, useLang } from '@/lib/i18n';
import { apiUrl } from '@/lib/platform';
import type { Session, VoiceInfo } from '@/lib/types';
import { fmtDay } from '@/lib/visit-text';

const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';
export const WhatsAppIcon = ({ size = 18 }: { size?: number }) => <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={WA_PATH} /></svg>;

const digits = (x: string) => x.replace(/\D/g, '');
const phoneOk = (x: string) => { const d = digits(x); return (d.length === 10) || (d.length === 11 && d.startsWith('0')) || (d.length >= 11 && d.length <= 15); };

export default function TeacherReportCard({ s, setError, onSent }: { s: Session; setError: (e: string) => void; onSent: () => void }) {
  const { lang , tr } = useLang();
  const name = s.brief.teacher?.name ?? 'the teacher';
  const [language, setLanguage] = useState<string>(lang);                   // the language of the voice message; starts as the language of the app
  const [voice, setVoice] = useState<VoiceInfo | null>(s.voice && s.voice.language === lang ? s.voice : null);
  const [making, setMaking] = useState(false);
  const [phone, setPhone] = useState(s.teacher_phone ?? '');
  const [email, setEmail] = useState(s.brief.teacher?.email ?? '');
  const [sending, setSending] = useState<'' | 'app' | 'wa'>('');
  const [result, setResult] = useState<{ text: string; link?: string } | null>(null);
  const seq = useRef(0);
  useEffect(() => { setEmail(s.brief.teacher?.email ?? ''); }, [s.brief.teacher?.email]);
  useEffect(() => { if (s.teacher_phone) setPhone(s.teacher_phone); }, [s.teacher_phone]);

  const make = useCallback(async () => {
    if (!s.teacher_id) return;
    const id = ++seq.current; setMaking(true);
    try { const v = await api.visits.voice(s.id, language); if (id === seq.current) setVoice(v); }
    catch (e) { if (id === seq.current) setError((e as Error).message); }
    finally { if (id === seq.current) setMaking(false); }
  }, [s.id, s.teacher_id, language, setError]);

  // The message is made while the CRP reads the results, so it is ready when it is time to send. A saved one in the same language is reused.
  useEffect(() => {
    if (s.voice && s.voice.language === language) { setVoice(s.voice); return; }
    setVoice(null); void make();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const savePhone = async () => {
    if (!s.teacher_id || !phone.trim() || !phoneOk(phone) || digits(phone) === digits(s.teacher_phone ?? '')) return;
    try { await api.setTeacherPhone(s.teacher_id, phone); refreshDirectory(); } catch (e) { setError((e as Error).message); }
  };

  const sendApp = async () => {
    setSending('app'); setResult(null);
    try {
      const r = await api.visits.sendReport(s.id, email.trim());
      setResult({ text: r.email === 'sent' ? tr('Sent to the teacher\'s app and by email to {to}.', { to: r.to }) : r.email === 'failed' ? tr('Sent to the teacher\'s app. {message}', { message: r.message }) : r.email === 'not_set_up' ? tr('Sent to the teacher\'s app. Email is not switched on yet, so no email went out.') : tr('Sent to the teacher\'s app.') });
      onSent();
    } catch (e) { setError((e as Error).message); } finally { setSending(''); }
  };

  const sendWhatsApp = async () => {
    if (!phoneOk(phone)) { setError(tr('Type the WhatsApp number of the teacher first (10 digits).')); return; }
    // A window opened at the tap is not blocked by the browser; it is pointed at WhatsApp when the answer arrives.
    const w = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null;
    setSending('wa'); setResult(null);
    try {
      const r = await api.visits.whatsapp(s.id, { phone, language, origin: window.location.origin });
      if (r.mode === 'link') { if (w) w.location.href = r.link; setResult({ text: `${r.message}${r.voice ? '' : ' The voice message could not be made, so only the report link is in it.'}`, link: r.link }); }
      else { w?.close(); setResult({ text: r.message, link: r.mode === 'failed' ? r.link : undefined }); }
      onSent(); refreshDirectory();
    } catch (e) { w?.close(); setError((e as Error).message); } finally { setSending(''); }
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
      subtitle={tr('The written report (PDF), a short voice message in the teacher\'s language, and a way to send both.')}>
      <div data-tour="res-voice" className="rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Volume2 size={18} className="text-brand-600" />{tr('Voice message to {name}', { name })}</p>
          {voice && <span className="text-xs text-ink-500">{voice.gender === 'male' ? tr('{n} seconds · male voice', { n: voice.seconds }) : tr('{n} seconds · female voice', { n: voice.seconds })}</span>}
        </div>
        <Field label={tr('Language of the voice message')} className="mt-2" hint={language === 'or' ? tr('There is no Odia voice yet, so this message is spoken in Hindi. The PDF is always in English.') : tr('The AI writes it the way you would say it, and a natural Indian voice reads it. The PDF stays in English.')}>
          <Select value={language} onChange={(e) => setLanguage(e.target.value)}>{LANGS.map((l) => <option key={l.code} value={l.code}>{tr(l.native)}{l.code !== 'en' ? ` (${l.english})` : ''}</option>)}</Select>
        </Field>
        <div className="mt-3">
          {making && <Spinner label={tr('Recording a short voice message in {language}… about 10 seconds', { language: langInfo?.english ?? 'English' })} />}
          {!making && voice && (
            <>
              <audio key={voice.url} controls preload="metadata" src={apiUrl(voice.url)} className="h-11 w-full" />
              <details className="mt-2"><summary className="-my-1 cursor-pointer py-1 text-sm font-semibold text-brand-700">{tr('Read what the voice says')}</summary><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{tr(voice.script)}</p></details>
              <div className="mt-1"><Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => void make()}>{tr('Make it again')}</Button></div>
            </>
          )}
          {!making && !voice && <Button variant="soft" icon={<Volume2 size={16} />} onClick={() => void make()}>{tr('Make the voice message')}</Button>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ExtLink href={api.visits.reportUrl(s.id)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><Eye size={16} />{tr('Open the report')}</ExtLink>
        <ExtLink href={api.visits.reportUrl(s.id, true)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"><Download size={16} />{tr('Download PDF')}</ExtLink>
      </div>

      <div className="mt-4 border-t border-brand-100 pt-4">
        <p className="mb-2 text-sm font-semibold text-ink-900">{tr('Send to {name}', { name })}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr('WhatsApp number')} hint={tr('10 digits. Saved for next time.')}><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={savePhone} placeholder={tr('98XXXXXXXX')} autoComplete="off" /></Field>
          <Field label={tr('Email (optional)')} hint={tr('The report is also in the teacher\'s app, with an alert.')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr('teacher@example.com')} /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" data-tour="res-whatsapp" onClick={sendWhatsApp} disabled={sending !== '' || making}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1fa855] px-4 py-2.5 text-sm font-semibold text-white shadow-float transition hover:bg-[#178f48] disabled:cursor-not-allowed disabled:opacity-50">
            <WhatsAppIcon />{sending === 'wa' ? tr('Sending…') : tr('Send on WhatsApp')}
          </button>
          <Button icon={<Send size={16} />} busy={sending === 'app'} disabled={sending !== ''} onClick={sendApp}>{email.trim() ? tr('Send in teacher app and email') : tr('Send in teacher app')}</Button>
        </div>
        {making && <p className="mt-2 text-xs text-ink-500">{tr('Wait a few seconds: the voice message is being recorded, so it goes with the report.')}</p>}
        {result && (
          <p role="status" className="mt-2 text-sm text-emerald-700">{tr(result.text)}{result.link && <> <a href={result.link} target="_blank" rel="noreferrer" className="font-semibold underline">{tr('Open WhatsApp')}</a></>}</p>
        )}
        {!result && s.report_sent_at && <p className="mt-2 text-xs text-ink-500">{tr('Last sent on {fmtDay}.', { fmtDay: fmtDay(s.report_sent_at) })}</p>}
      </div>
    </Card>
  );
}
