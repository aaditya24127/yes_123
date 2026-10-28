import { cn } from '@/lib/cn'

interface SharedMentoringMomentProps {
  className?: string
}

/**
 * Editorial watercolor illustration: "The Mentoring Checklist".
 *
 * Depicts an open observation notebook and hand holding a forest-green pencil
 * in the foreground, with a winding ochre path leading across rural school grounds.
 * Expands naturally across the right column with organic watercolor feathering.
 */
export function SharedMentoringMoment({ className }: SharedMentoringMomentProps) {
  return (
    <div className={cn('relative mx-auto w-full max-w-2xl lg:max-w-none', className)}>
      <div className="-mx-4 sm:mx-0 lg:-mr-6 xl:-mr-12 2xl:-mr-16">
        <img
          src="/images/mentoring-checklist.png"
          alt="Watercolor illustration of the mentoring checklist: an observation notebook and pencil in the foreground, with a winding ochre path leading toward a sunlit village school"
          className="checklist-fade block h-auto w-full select-none"
          width={1200}
          height={896}
          loading="lazy"
          decoding="async"
        />
      </div>
    </div>
  )
}
