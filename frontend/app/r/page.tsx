'use client';
// The page a teacher opens from the link in the chat (no sign-in: the link carries a signed code).
//   1. choose your language   2. choose what to see: the written report, or the CRP's short voice message   3. the report / the voice.
// The report and the voice are made in the chosen language by the server (translated by the AI the first time, then kept); both are fetched in the background
// as soon as a language is chosen, so the next screen opens at once. Headings and buttons come from the app's own translations (`tr`).
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, FileText, Globe, Lightbulb, Printer, TriangleAlert, Volume2 } from 'lucide-react';
import LanguageSwitch from '@/components/LanguageSwitch';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { LANGS, useLang, type Lang } from '@/lib/i18n';
import { apiUrl } from '@/lib/platform';
import type { ReportView, VoiceInfo } from '@/lib/types';
import { fmtDay } from '@/lib/visit-text';

type Step = 'lang' | 'choose' | 'report' | 'voice';
const card = 'rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100 print:shadow-none print:ring-0';

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className={`${card} mt-4 break-inside-avoid`}><h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold text-ink-900">{icon}{title}</h2>{children}</section>;
}

function Report({ v }: { v: ReportView }) {
  const { tr } = useLang();
  const c = v.content; const m = c.meta;
  const none = <p className="text-sm text-ink-500">{tr('Nothing to add this time.')}</p>;
  const tone = (x: string) => (x === 'Correct' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : x === 'Not correct' ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-amber-50 text-amber-800 ring-amber-200');
  return (
    <>
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">{tr('Visit report')}</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-ink-900">{m.teacher}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-ink-700">
          {m.school && <span className="rounded-full bg-brand-50 px-3 py-1 ring-1 ring-brand-100">{m.school}</span>}
          {m.class_no != null && <span className="rounded-full bg-brand-50 px-3 py-1 ring-1 ring-brand-100">{tr('Class')} {m.class_no}</span>}
          {m.subject && <span className="rounded-full bg-brand-50 px-3 py-1 ring-1 ring-brand-100">{m.subject}</span>}
          {m.topic && <span className="rounded-full bg-brand-50 px-3 py-1 ring-1 ring-brand-100">{m.topic}</span>}
          {m.date && <span className="rounded-full bg-brand-50 px-3 py-1 ring-1 ring-brand-100">{fmtDay(m.date)}</span>}
        </div>
        {m.crp && <p className="mt-2 text-xs text-ink-500">{tr('Visited by')} {m.crp}</p>}
        {!v.translated && v.language !== 'en' && <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200"><TriangleAlert size={14} className="mt-0.5 shrink-0" />{tr('This part could not be translated right now and is shown in English.')}</p>}
      </div>

      <Section title={tr('Summary')}><p className="leading-relaxed text-ink-700">{c.overall}</p></Section>

      <Section title={tr('What went well')} icon={<Check size={18} className="text-emerald-600" />}>
        {c.strengths.length ? <ul className="space-y-3">{c.strengths.map((x, i) => <li key={i}><p className="font-semibold text-ink-900">{x.point}</p>{x.evidence && <p className="text-sm text-ink-500">{x.evidence}</p>}</li>)}</ul> : none}
      </Section>

      <Section title={tr('What to improve')} icon={<Lightbulb size={18} className="text-amber-600" />}>
        {c.growth.length ? (
          <ul className="space-y-4">{c.growth.map((x, i) => (
            <li key={i} className="rounded-2xl bg-page p-3 ring-1 ring-brand-100">
              <p className="font-semibold text-ink-900">{x.area}</p>
              {x.why && <p className="mt-1 text-sm text-ink-700">{x.why}</p>}
              {x.try_this && <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink-900"><b>{tr('Try this')}: </b>{x.try_this}</p>}
              {x.evidence && <p className="mt-2 text-xs text-ink-500"><b>{tr('Seen in class')}: </b>{x.evidence}</p>}
            </li>
          ))}</ul>
        ) : none}
      </Section>

      {(c.students.summary || c.students.answers.length > 0) && (
        <Section title={tr('What the students answered')}>
          {c.students.summary && <p className="mb-3 text-ink-700">{c.students.summary}</p>}
          <ul className="space-y-2">{c.students.answers.map((a, i) => (
            <li key={i} className="rounded-2xl bg-page p-3 text-sm ring-1 ring-brand-100">
              <p className="font-semibold text-ink-900">{a.question}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone(a.verdict)}`}>{tr(a.verdict)}</span>{a.note && <span className="text-ink-500">{a.note}</span>}</p>
            </li>
          ))}</ul>
        </Section>
      )}

      {c.students.reasons.length > 0 && (
        <Section title={tr('Why the students found it hard')}>
          <ul className="space-y-3">{c.students.reasons.map((x, i) => (
            <li key={i} className="rounded-2xl bg-page p-3 ring-1 ring-brand-100">
              <p className="font-semibold text-ink-900">{x.issue}</p>
              {x.likely_reason && <p className="mt-1 text-sm text-ink-700">{x.likely_reason}</p>}
              {x.teacher_action && <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink-900"><b>{tr('What you can do')}: </b>{x.teacher_action}</p>}
            </li>
          ))}</ul>
        </Section>
      )}

      <Section title={tr('Agreed next steps')}>
        {c.next_steps.length ? <ul className="list-disc space-y-1.5 ps-5 text-ink-700">{c.next_steps.map((x, i) => <li key={i}>{x.action}{x.due_in_days ? <span className="text-sm text-ink-500"> ({tr('in {n} days', { n: x.due_in_days })})</span> : null}</li>)}</ul> : none}
        <p className="mt-3 text-sm text-ink-500">{tr('Next visit in about {n} days.', { n: c.follow_up_days })}</p>
      </Section>

      {c.practices.length > 0 && (
        <Section title={tr('Teaching practices')}>
          <ul className="space-y-3">{c.practices.map((x, i) => (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3"><p className="text-sm font-semibold text-ink-900">{x.element}</p><p className="shrink-0 text-sm font-semibold text-brand-700">{x.score ?? '-'} <span className="text-xs font-normal text-ink-500">{tr('out of 5')}</span></p></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(5, x.score ?? 0)) * 20}%` }} /></div>
              {x.evidence && <p className="mt-1 text-xs text-ink-500">{x.evidence}</p>}
            </li>
          ))}</ul>
        </Section>
      )}
    </>
  );
}

function ReportPage() {
  const { tr, lang, setLang, dir } = useLang();
  const q = useSearchParams();
  const id = q.get('id') ?? ''; const sig = q.get('sig') ?? ''; const suggested = (q.get('lang') ?? '') as Lang;
  const valid = !!id && !!sig;
  const [step, setStep] = useState<Step>('lang');
  const [view, setView] = useState<ReportView | null>(null);
  const [voice, setVoice] = useState<VoiceInfo | null>(null);
  const [err, setErr] = useState('');
  const asked = useRef<Record<string, { view?: Promise<ReportView>; voice?: Promise<VoiceInfo> }>>({});
  const audio = useRef<HTMLAudioElement | null>(null);

  // Started as soon as a language is chosen (and again if the language is changed): the next screens then open at once.
  const prefetch = (code: string) => {
    const a = (asked.current[code] ??= {});
    if (!a.view) { a.view = api.publicReport.view(id, sig, code); a.view.catch(() => { delete a.view; }); }
    if (!a.voice) { a.voice = api.publicReport.voice(id, sig, code); a.voice.catch(() => { delete a.voice; }); }
    return a;
  };

  const choose = (code: Lang) => { setLang(code); setStep('choose'); setErr(''); setView(null); setVoice(null); if (valid) prefetch(code); };

  useEffect(() => {
    if (step === 'lang' || step === 'choose' || !valid) return;
    let live = true; setErr('');
    const a = prefetch(lang);
    if (step === 'report') {
      setView(null);
      a.view!.then((v) => { if (live) setView(v); }).catch(() => { if (live) setErr(tr('The report could not be opened. Please try again.')); });
    } else {
      setVoice(null);
      a.voice!.then((v) => { if (live) setVoice(v); }).catch(() => { if (live) setErr(tr('The voice message could not be made. Please try again.')); });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lang]);

  useEffect(() => { if (voice && audio.current) audio.current.play().catch(() => { /* the phone wants a tap first: the Play button is there */ }); }, [voice]);

  const bare = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition';
  const back = (to: Step) => <button type="button" onClick={() => setStep(to)} className={`${bare} text-brand-700 hover:bg-brand-50 print:hidden`}><ArrowLeft size={16} className="rtl:rotate-180" />{tr('Back')}</button>;

  return (
    <div dir={dir} className="min-h-dvh bg-page pb-12 print:bg-white">
      <header className="sticky top-0 z-20 border-b border-brand-100 bg-page/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold text-white shadow-float">C</div>
          <p className="min-w-0 flex-1 truncate font-serif text-lg font-semibold text-ink-900">{tr('CRP Mentor Copilot')}</p>
          <LanguageSwitch />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {!valid && <div className={card}><p className="flex items-center gap-2 font-semibold text-red-700"><TriangleAlert size={18} />{tr('This link is not valid.')}</p></div>}

        {valid && step === 'lang' && (
          <div className={card}>
            <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-ink-900"><Globe size={22} className="text-brand-600" />{tr('Choose your language')}</h1>
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {LANGS.map((l) => (
                <button key={l.code} type="button" onClick={() => choose(l.code)} lang={l.code}
                  className={`flex min-h-14 flex-col items-start justify-center rounded-2xl px-4 py-2.5 text-start transition ${l.code === suggested ? 'bg-brand-600 text-white shadow-float' : 'bg-brand-50/70 text-ink-900 ring-1 ring-brand-100 hover:bg-brand-100'}`}>
                  <span className="text-lg font-semibold leading-tight">{l.native}</span>
                  <span className={`text-xs ${l.code === suggested ? 'text-white/80' : 'text-ink-500'}`} lang="en">{l.english}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {valid && step === 'choose' && (
          <div>
            <h1 className="font-serif text-2xl font-semibold text-ink-900">{tr('What would you like to see?')}</h1>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={() => setStep('report')} className={`${card} flex items-center gap-4 text-start transition hover:bg-brand-50`}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white"><FileText size={26} /></span>
                <span><b className="block font-serif text-xl text-ink-900">{tr('Report')}</b><span className="text-sm text-ink-500">{tr('The written report of the visit')}</span></span>
              </button>
              <button type="button" onClick={() => setStep('voice')} className={`${card} flex items-center gap-4 text-start transition hover:bg-brand-50`}>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-ink-900"><Volume2 size={26} /></span>
                <span><b className="block font-serif text-xl text-ink-900">{tr('Your CRP\'s short review')}</b><span className="text-sm text-ink-500">{tr('A short voice message about the visit')}</span></span>
              </button>
            </div>
            <div className="mt-3">{back('lang')}</div>
          </div>
        )}

        {valid && step === 'report' && (
          <>
            {err && <div className={card}><p className="flex items-center gap-2 font-semibold text-red-700"><TriangleAlert size={18} />{err}</p></div>}
            {!err && !view && <div className={card}><Spinner label={tr('Translating the report…')} /></div>}
            {view && <Report v={view} />}
            <div className="mt-5 flex flex-wrap gap-2 print:hidden">
              {back('choose')}
              <button type="button" onClick={() => setStep('voice')} className={`${bare} bg-amber-400 text-ink-900 shadow-float`}><Volume2 size={16} />{tr('Your CRP\'s short review')}</button>
              {view && <button type="button" onClick={() => window.print()} className={`${bare} bg-brand-600 text-white shadow-float`}><Printer size={16} />{tr('Save as PDF')}</button>}
            </div>
          </>
        )}

        {valid && step === 'voice' && (
          <>
            <div className={card}>
              <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-ink-900"><Volume2 size={22} className="text-amber-600" />{tr('Your CRP\'s short review')}</h1>
              {err && <p className="mt-3 flex items-center gap-2 font-semibold text-red-700"><TriangleAlert size={18} />{err}</p>}
              {!err && !voice && <div className="mt-4"><Spinner label={tr('Preparing the voice message in your language. This takes a few seconds.')} /></div>}
              {voice && (
                <div className="mt-4">
                  <audio ref={audio} key={voice.url} controls preload="auto" src={apiUrl(voice.url)} className="h-12 w-full" />
                  <details className="mt-3"><summary className="-my-1 cursor-pointer py-2 text-sm font-semibold text-brand-700">{tr('Read what the voice says')}</summary><p className="mt-1 whitespace-pre-wrap leading-relaxed text-ink-700" lang={voice.voice_language ?? undefined}>{voice.script}</p></details>
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {back('choose')}
              <button type="button" onClick={() => setStep('report')} className={`${bare} bg-brand-600 text-white shadow-float`}><FileText size={16} />{tr('Report')}</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><ReportPage /></Suspense>;
}
