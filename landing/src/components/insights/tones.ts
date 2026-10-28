import type { Tone } from '@/components/ui/Pill'
import type { GapStatus, PriorityLevel } from '@/data/sampleData'

export const priorityTone: Record<PriorityLevel, Tone> = {
  High: 'clay',
  Medium: 'accent',
  Watch: 'sage',
}

export const priorityDot: Record<PriorityLevel, string> = {
  High: 'bg-clay-400',
  Medium: 'bg-accent-400',
  Watch: 'bg-sage-400',
}

export const gapStatusClasses: Record<GapStatus, { bar: string; text: string }> = {
  'Needs focus': { bar: 'bg-clay-400', text: 'text-clay-600' },
  Emerging: { bar: 'bg-accent-400', text: 'text-accent-600' },
  'On track': { bar: 'bg-teal-400', text: 'text-teal-600' },
}
