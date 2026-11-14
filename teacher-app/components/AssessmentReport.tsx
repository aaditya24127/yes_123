'use client';
// The assessment report on screen (the PDF has the same content). Used by the teacher app and, as a copy, by the CRP website: keep the two in step.
import { ExternalLink, FileDown } from 'lucide-react';
import type { AssessReport } from '@/lib/api';

type Props = { a: { subject: string; class_no: number | null; chapter: string; report: AssessReport | null; pdf_url: string | null }; who?: string };

const RATING: Record<string, [string, string]> = {
  strong: ['Strong', 'text-emerald-700'], some: ['Some', 'text-amber-700'], weak: ['Weak', 'text-red-700'], not_mentioned: ['Not mentioned', 'text-ink-500'],
  good: ['Good', 'text-emerald-700'], partly: ['Partly', 'text-amber-700'], poor: ['Poor', 'text-red-700'],
};
const FIX: Record<string, [string, string]> = { correct: ['Correct', 'text-emerald-700'], partly: ['Partly correct', 'text-amber-700'], incorrect: ['Not correct', 'text-red-700'], not_given: ['No fix described', 'text-ink-500'] };
const FIT: Record<string, [string, string]> = { fits: ['Fits', 'text-emerald-700'], partly: ['Partly fits', 'text-amber-700'], does_not_fit: ['Does not fit', 'text-red-700'] };
const tone = (v: number | null | undefined) => (v == null ? 'text-ink-500' : v >= 70 ? 'text-emerald-700' : v >= 50 ? 'text-amber-700' : 'text-red-700');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-4 rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100"><h2 className="mb-2 font-serif text-lg font-semibold text-ink-900">{title}</h2>{children}</section>;
}
function Bullets({ items, empty = 'Nothing specific was noted.' }: { items?: string[]; empty?: string }) {
  return items?.length ? <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-ink-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />{x}</li>)}</ul> : <p className="text-sm text-ink-500">{empty}</p>;
}
function Score({ label, value, sub, bar }: { label: string; value: number | null; sub: string; bar: string }) {
  return (
    <div className="rounded-2xl bg-page p-3 text-center ring-1 ring-brand-100">
      <p className="font-serif text-3xl font-semibold text-brand-700">{value ?? '-'}</p>
      <p className="text-sm font-semibold text-ink-900">{label}</p><p className="text-xs text-ink-500">{sub}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-100"><div className={`h-full rounded-full ${bar}`} style={{ width: `${value ?? 0}%` }} /></div>
    </div>
  );
}

export default function AssessmentReport({ a, who }: Props) {
  const r = a.report;
  if (!r) return null;
  const rate = (t: Record<string, [string, string]>, k: string) => { const [w, c] = t[k] ?? [k || '-', 'text-ink-500']; return <span className={`font-semibold ${c}`}>{w}</span>; };
  return (
    <div>
      <div className="rounded-3xl bg-brand-700 p-5 text-white shadow-float">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold">C</div>
          <div className="leading-tight"><p className="font-serif text-lg font-semibold">CRP Mentor Copilot</p><p className="text-xs font-semibold uppercase tracking-wider text-brand-200">Assessment report</p></div>
        </div>
        <p className="mt-3 text-sm text-brand-100">{who ? `${who} · ` : ''}{a.subject}{a.class_no ? `, Class ${a.class_no}` : ''}: {a.chapter}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Score label="Topic knowledge" value={r.scores.knowledge} sub="60% of overall" bar="bg-brand-500" />
        <Score label="Teaching method" value={r.scores.teaching} sub="40% of overall" bar="bg-amber-400" />
        <Score label="Overall" value={r.scores.overall} sub="weighted 60 / 40" bar="bg-brand-700" />
        <Score label="Confidence" value={r.scores.confidence} sub={r.scores.confidence == null ? 'not measured (typed)' : 'indicator only'} bar="bg-ink-400" />
      </div>
      {a.pdf_url && <a href={a.pdf_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><FileDown size={16} />Open the PDF report<ExternalLink size={14} /></a>}

      <Section title="In short"><p className="text-ink-700">{r.summary}</p></Section>

      <Section title="Question by question">
        <div className="space-y-3">
          {r.questions.map((q) => (
            <div key={q.n} className="rounded-2xl bg-page p-3 ring-1 ring-brand-100">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Question {q.n} · {q.kind === 'knowledge' ? 'Topic knowledge' : 'Teaching method'}</p>
                <p className={`font-serif text-xl font-semibold ${tone(q.score)}`}>{q.score}</p>
              </div>
              <p className="mt-0.5 font-semibold text-ink-900">{q.question}</p>
              <p className="mt-1 text-sm text-ink-700"><span className="text-ink-500">You said: </span>{q.said}</p>
              {q.comment && <p className="mt-1 text-sm text-ink-700">{q.comment}</p>}
              <p className="mt-1 text-xs text-ink-500">Confidence indicator: {q.confidence.band === 'not_measured' ? 'not measured' : `${q.confidence.band} (${q.confidence.score})`}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What went well"><Bullets items={r.strengths} /></Section>
      <Section title="What you could change"><Bullets items={r.changes} /></Section>
      {r.better_methods?.length > 0 && (
        <Section title="Better tools and methods for this chapter">
          <ul className="space-y-2">{r.better_methods.map((m, i) => <li key={i} className="text-ink-700"><b className="text-ink-900">{m.idea}.</b> {m.why}</li>)}</ul>
        </Section>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Do"><Bullets items={r.do} /></Section>
        <Section title="Do not"><Bullets items={r.dont} /></Section>
      </div>

      <Section title="Student mistakes you named">
        {r.misconceptions?.length ? <ul className="space-y-2">{r.misconceptions.map((m, i) => <li key={i} className="text-ink-700"><b className="text-ink-900">{m.misconception}</b> · fix: {m.fix_given} · {rate(FIX, m.fix_is)}{m.note ? <span className="block text-sm text-ink-500">{m.note}</span> : null}</li>)}</ul>
          : <p className="text-sm text-ink-500">You did not name any student mistakes. Your mentor may ask about this.</p>}
      </Section>
      <Section title="Websites and materials you named">
        {r.tools?.length ? <ul className="space-y-2">{r.tools.map((t, i) => <li key={i} className="text-ink-700"><b className="text-ink-900">{t.name}</b> ({t.kind}) · {rate(FIT, t.fits)}{t.note ? <span className="block text-sm text-ink-500">{t.note}</span> : null}</li>)}</ul>
          : <p className="text-sm text-ink-500">You did not name any website, simulation or material.</p>}
      </Section>
      <Section title="Classroom practice">
        <ul className="space-y-2 text-ink-700">
          <li><b className="text-ink-900">Checking understanding:</b> {rate(RATING, r.checking_understanding.rating)}<span className="block text-sm text-ink-500">{r.checking_understanding.note}</span></li>
          <li><b className="text-ink-900">Support for weaker students:</b> {rate(RATING, r.weaker_students.rating)}<span className="block text-sm text-ink-500">{r.weaker_students.note}</span></li>
          <li><b className="text-ink-900">Fit with the board and class:</b> {rate(RATING, r.board_class_fit.rating)}<span className="block text-sm text-ink-500">{r.board_class_fit.note}</span></li>
        </ul>
      </Section>

      <Section title="Speaking data">
        <p className="text-sm text-ink-700">Average pace <b>{r.speaking.avg_wpm ?? '-'}</b> words a minute · long pauses <b>{r.speaking.pauses}</b> (longest {r.speaking.longest_pause} s) · filler words <b>{r.speaking.fillers}</b> · hedging phrases <b>{r.speaking.hedges}</b></p>
        <p className="mt-2 text-sm text-ink-500">{r.data_quality.answered} of {r.data_quality.total} questions answered. {r.data_quality.note}</p>
      </Section>
      <Section title="What your mentor may look at during the visit"><Bullets items={r.visit_focus} /></Section>
      <p className="mt-4 px-1 text-xs text-ink-400">Confidence figures are indicators from how the answers were spoken, not a judgement of you. Recordings are not kept; only the words and the speaking data.</p>
    </div>
  );
}
