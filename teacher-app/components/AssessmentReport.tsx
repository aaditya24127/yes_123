'use client';
// The assessment report on screen (the PDF has the same content). Used by the teacher app and, as a copy, by the CRP website: keep the two in step.
import { ExternalLink, FileDown } from 'lucide-react';
import type { AssessReport } from '@/lib/api';
import { useLang } from '@/lib/i18n';

type Props = { a: { subject: string; class_no: number | null; chapter: string; report: AssessReport | null; pdf_url: string | null }; who?: string };

const RATING: Record<string, [string, string]> = {
  strong: ['Strong', 'text-emerald-700'], some: ['Some', 'text-amber-700'], weak: ['Weak', 'text-red-700'], not_mentioned: ['Not mentioned', 'text-ink-500'],
  good: ['Good', 'text-emerald-700'], partly: ['Partly', 'text-amber-700'], poor: ['Poor', 'text-red-700'],
};
const FIX: Record<string, [string, string]> = { correct: ['Correct', 'text-emerald-700'], partly: ['Partly correct', 'text-amber-700'], incorrect: ['Not correct', 'text-red-700'], not_given: ['No fix described', 'text-ink-500'] };
const FIT: Record<string, [string, string]> = { fits: ['Fits', 'text-emerald-700'], partly: ['Partly fits', 'text-amber-700'], does_not_fit: ['Does not fit', 'text-red-700'] };
const tone = (v: number | null | undefined) => (v == null ? 'text-ink-500' : v >= 70 ? 'text-emerald-700' : v >= 50 ? 'text-amber-700' : 'text-red-700');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { tr } = useLang();
  return <section className="mt-4 rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100"><h2 className="mb-2 font-serif text-lg font-semibold text-ink-900">{tr(title)}</h2>{children}</section>;
}
function Bullets({ items, empty = 'Nothing specific was noted.' }: { items?: string[]; empty?: string }) {
  const { tr } = useLang();
  return items?.length ? <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-ink-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{tr(x)}</li>)}</ul> : <p className="text-sm text-ink-500">{tr(empty)}</p>;
}
function Score({ label, value, sub, bar }: { label: string; value: number | null; sub: string; bar: string }) {
  const { tr } = useLang();
  return (
    <div className="rounded-2xl bg-page p-3 text-center ring-1 ring-brand-100">
      <p className="font-serif text-3xl font-semibold text-brand-700">{value ?? '-'}</p>
      <p className="text-sm font-semibold text-ink-900">{tr(label)}</p><p className="text-xs text-ink-500">{tr(sub)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100"><div className={`h-full rounded-full ${bar}`} style={{ width: `${value ?? 0}%` }} /></div>
    </div>
  );
}

export default function AssessmentReport({ a, who }: Props) {
  const { tr } = useLang();
  const r = a.report;
  if (!r) return null;
  const rate = (t: Record<string, [string, string]>, k: string) => { const [w, c] = t[k] ?? [k || '-', 'text-ink-500']; return <span className={`font-semibold ${c}`}>{tr(w)}</span>; };
  return (
    <div>
      <div className="rounded-3xl bg-brand-700 p-5 text-white shadow-float">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold">{tr('C')}</div>
          <div className="leading-tight"><p className="font-serif text-lg font-semibold">{tr('CRP Mentor Copilot')}</p><p className="text-xs font-semibold uppercase tracking-wider text-brand-200">{tr('Assessment report')}</p></div>
        </div>
        <p className="mt-3 text-sm text-brand-100">{who ? `${who} · ` : ''}{tr(a.subject)}{a.class_no ? tr(', Class {class_no}', { class_no: a.class_no }) : ''}: {tr(a.chapter)}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Score label={tr('Topic knowledge')} value={r.scores.knowledge} sub="60% of overall" bar="bg-brand-500" />
        <Score label={tr('Teaching method')} value={r.scores.teaching} sub="40% of overall" bar="bg-amber-400" />
        <Score label={tr('Overall')} value={r.scores.overall} sub="weighted 60 / 40" bar="bg-brand-700" />
        <Score label={tr('Confidence')} value={r.scores.confidence} sub={r.scores.confidence == null ? 'not measured (typed)' : 'indicator only'} bar="bg-ink-400" />
      </div>
      {a.pdf_url && <a href={a.pdf_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><FileDown size={16} />{tr('Open the PDF report')}<ExternalLink size={14} /></a>}

      <Section title={tr('In short')}><p className="text-ink-700">{tr(r.summary)}</p></Section>

      <Section title={tr('Question by question')}>
        <div className="space-y-3">
          {r.questions.map((q) => (
            <div key={q.n} className="rounded-2xl bg-page p-3 ring-1 ring-brand-100">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{tr('Question')}{' '}{q.n} · {q.kind === 'knowledge' ? tr('Topic knowledge') : tr('Teaching method')}</p>
                <p className={`font-serif text-xl font-semibold ${tone(q.score)}`}>{q.score}</p>
              </div>
              <p className="mt-0.5 font-semibold text-ink-900">{tr(q.question)}</p>
              <p className="mt-1 text-sm text-ink-700"><span className="text-ink-500">{tr('You said:')}{' '}</span>{tr(q.said)}</p>
              {q.comment && <p className="mt-1 text-sm text-ink-700">{tr(q.comment)}</p>}
              <p className="mt-1 text-xs text-ink-500">{tr('Confidence indicator:')}{' '}{q.confidence.band === 'not_measured' ? tr('not measured') : `${tr(q.confidence.band.charAt(0).toUpperCase() + q.confidence.band.slice(1))} (${q.confidence.score})`}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={tr('What went well')}><Bullets items={r.strengths} /></Section>
      <Section title={tr('What you could change')}><Bullets items={r.changes} /></Section>
      {r.better_methods?.length > 0 && (
        <Section title={tr('Better tools and methods for this chapter')}>
          <ul className="space-y-2">{r.better_methods.map((m, i) => <li key={i} className="text-ink-700"><b className="text-ink-900">{tr(m.idea)}.</b> {tr(m.why)}</li>)}</ul>
        </Section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title={tr('Do')}><Bullets items={r.do} /></Section>
        <Section title={tr('Do not')}><Bullets items={r.dont} /></Section>
      </div>

      <Section title={tr('Student mistakes you named')}>
        {r.misconceptions?.length ? <ul className="space-y-2">{r.misconceptions.map((m, i) => <li key={i} className="text-ink-700"><b className="text-ink-900">{tr(m.misconception)}</b>{' '}{tr('· fix:')}{' '}{tr(m.fix_given)} · {rate(FIX, m.fix_is)}{m.note ? <span className="block text-sm text-ink-500">{tr(m.note)}</span> : null}</li>)}</ul>
          : <p className="text-sm text-ink-500">{tr('You did not name any student mistakes. Your mentor may ask about this.')}</p>}
      </Section>
      <Section title={tr('Websites and materials you named')}>
        {r.tools?.length ? <ul className="space-y-2">{r.tools.map((t, i) => <li key={i} className="text-ink-700"><b className="text-ink-900">{tr(t.name)}</b> ({tr(t.kind)}) · {rate(FIT, t.fits)}{t.note ? <span className="block text-sm text-ink-500">{tr(t.note)}</span> : null}</li>)}</ul>
          : <p className="text-sm text-ink-500">{tr('You did not name any website, simulation or material.')}</p>}
      </Section>
      <Section title={tr('Classroom practice')}>
        <ul className="space-y-2 text-ink-700">
          <li><b className="text-ink-900">{tr('Checking understanding:')}</b> {rate(RATING, r.checking_understanding.rating)}<span className="block text-sm text-ink-500">{tr(r.checking_understanding.note)}</span></li>
          <li><b className="text-ink-900">{tr('Support for weaker students:')}</b> {rate(RATING, r.weaker_students.rating)}<span className="block text-sm text-ink-500">{tr(r.weaker_students.note)}</span></li>
          <li><b className="text-ink-900">{tr('Fit with the board and class:')}</b> {rate(RATING, r.board_class_fit.rating)}<span className="block text-sm text-ink-500">{tr(r.board_class_fit.note)}</span></li>
        </ul>
      </Section>

      <Section title={tr('Speaking data')}>
        <p className="text-sm text-ink-700">{tr('Average pace {wpm} words a minute · {pauses} long pauses (longest {longest} s) · {fillers} filler words · {hedges} hedging phrases', { wpm: r.speaking.avg_wpm ?? '-', pauses: r.speaking.pauses, longest: r.speaking.longest_pause, fillers: r.speaking.fillers, hedges: r.speaking.hedges })}</p>
        <p className="mt-2 text-sm text-ink-500">{tr('{answered} of {total} questions answered. {note}', { answered: r.data_quality.answered, total: r.data_quality.total, note: r.data_quality.note })}</p>
      </Section>
      <Section title={tr('What your mentor may look at during the visit')}><Bullets items={r.visit_focus} /></Section>
      <p className="mt-4 px-1 text-xs text-ink-400">{tr('Confidence figures are indicators from how the answers were spoken, not a judgement of you. Recordings are not kept; only the words and the speaking data.')}</p>
    </div>
  );
}
