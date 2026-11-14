import { CalendarClock, Check, Sparkles } from 'lucide-react'
import { priorityDot, priorityTone } from '@/components/insights/tones'
import { Pill } from '@/components/ui/Pill'
import { gradeIndicators, progressPairs, schoolPriorities, visitPlan } from '@/data/sampleData'
import { cn } from '@/lib/cn'

/* Miniature, read-only previews shown on the feature flashcards. All sample data. */

export function PrioritiesPreview() {
  return (
    <ul className="flex h-full flex-col justify-center gap-1.5 p-2.5">
      {schoolPriorities.map((item) => (
        <li key={item.school} className="flex items-center justify-between gap-2 rounded-lg bg-surface/90 px-2.5 py-2 shadow-[0_1px_2px_rgb(60_48_30/0.06)]">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn('size-2 shrink-0 rounded-full', priorityDot[item.level])} aria-hidden="true" />
            <span className="truncate text-[0.72rem] font-medium text-foreground">{item.school}</span>
          </span>
          <Pill tone={priorityTone[item.level]}>{item.level}</Pill>
        </li>
      ))}
    </ul>
  )
}

export function GapsPreview() {
  return (
    <div className="flex h-full flex-col p-3">
      <p className="text-[0.7rem] font-semibold tracking-wider text-subtle uppercase">Learners on track, by grade</p>
      <div className="mt-2 flex flex-1 items-end justify-around border-b border-border pb-px">
        {gradeIndicators.map((indicator) => (
          <div key={indicator.grade} className="flex h-full items-end gap-1">
            <span className="w-3 rounded-t-sm bg-teal-400" style={{ height: `${indicator.reading * 100}%` }} />
            <span className="w-3 rounded-t-sm bg-accent-400" style={{ height: `${indicator.numeracy * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-around text-[0.7rem] text-muted">
        {gradeIndicators.map((indicator) => (
          <span key={indicator.grade}>{indicator.grade}</span>
        ))}
      </div>
      <div className="mt-1.5 flex justify-center gap-3 text-[0.7rem] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-teal-400" aria-hidden="true" />
          Reading
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-accent-400" aria-hidden="true" />
          Numeracy
        </span>
      </div>
    </div>
  )
}

export function RecommendationPreview() {
  return (
    <div className="flex h-full flex-col justify-between bg-brand-800 p-3.5 text-brand-50">
      <p className="flex items-center gap-1 text-[0.7rem] font-semibold tracking-[0.14em] text-accent-200 uppercase">
        <Sparkles className="size-3" aria-hidden="true" />
        Suggested next step
      </p>
      <p className="font-display text-[0.9rem] leading-snug text-surface">
        Model a ten-minute place-value warm-up, then co-teach it once with the teacher.
      </p>
      <p className="text-[0.7rem] text-brand-100/70">Based on three sample observations</p>
    </div>
  )
}

export function VisitPlanPreview() {
  return (
    <div className="flex h-full gap-3 p-3">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-surface py-2 shadow-card">
        <span className="text-[0.7rem] font-semibold text-clay-500 uppercase">{visitPlan.visitWeek}</span>
        <span className="font-display text-xl leading-tight text-brand-900">{visitPlan.visitDay}</span>
        <span className="text-[0.7rem] text-muted">Visit</span>
      </div>
      <div className="min-w-0 flex-1 text-[0.7rem]">
        <p className="truncate font-semibold text-foreground">{visitPlan.school}</p>
        <p className="truncate text-muted">{visitPlan.focus}</p>
        <ul className="mt-2 space-y-1">
          {visitPlan.checklist.map((item) => (
            <li key={item} className="flex items-center gap-1.5 text-foreground">
              <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <Check className="size-2.5" aria-hidden="true" />
              </span>
              <span className="truncate">{item}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[0.7rem] font-semibold text-teal-700">
          <CalendarClock className="size-3" aria-hidden="true" />
          Follow-up · {visitPlan.followUp}
        </p>
      </div>
    </div>
  )
}

export function ProgressPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-3 p-3">
      {progressPairs.map((pair) => (
        <div key={pair.area}>
          <p className="text-[0.7rem] font-medium text-foreground">{pair.area}</p>
          <div className="mt-1 space-y-1">
            {(
              [
                ['Before', pair.baseline, 'bg-sage-400'],
                ['After', pair.followUp, 'bg-brand-500'],
              ] as const
            ).map(([label, value, barClass]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-9 text-[0.7rem] text-muted">{label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sage-100">
                  <span className={cn('block h-full rounded-full', barClass)} style={{ width: `${value * 100}%` }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
