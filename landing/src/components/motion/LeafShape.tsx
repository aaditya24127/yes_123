import { cn } from '@/lib/cn'

export type LeafVariant = 'ovate' | 'lanceolate' | 'peepal'

interface LeafPaths {
  outline: string
  midrib: string
  /** Side veins, drawn only on detailed (near) leaves. */
  veins: string
}

// Each leaf points upward in a 40×40 box.
const leafPaths: Record<LeafVariant, LeafPaths> = {
  ovate: {
    outline: 'M20 2C30 10 33 22 20 38C7 22 10 10 20 2Z',
    midrib: 'M20 7V35',
    veins: 'M20 13L25.5 9.5M20 19L27.5 14.5M20 25L26.5 21.5M20 13L14.5 9.5M20 19L12.5 14.5M20 25L13.5 21.5',
  },
  lanceolate: {
    outline: 'M20 1C26 12 26 26 20 39C14 26 14 12 20 1Z',
    midrib: 'M20 5V36',
    veins: 'M20 11L23.5 7.5M20 17L24.5 13M20 23L24 19.5M20 29L23 26M20 11L16.5 7.5M20 17L15.5 13M20 23L16 19.5M20 29L17 26',
  },
  peepal: {
    outline:
      'M20 1C21 7 23 10 27 12C36 17 36 30 26 35C23 37 21 38 20 39C19 38 17 37 14 35C4 30 4 17 13 12C17 10 19 7 20 1Z',
    midrib: 'M20 6V37',
    veins: 'M20 14L27.5 13M20 20L31 20M20 26L28 29.5M20 14L12.5 13M20 20L9 20M20 26L12 29.5',
  },
}

interface LeafShapeProps {
  variant: LeafVariant
  /** A Tailwind fill utility, e.g. "fill-brand-500". */
  colorClass: string
  /** Adds side veins, a shaded half and an edge line for close-up leaves. */
  detailed?: boolean
  className?: string
}

/** A single stylised leaf with a watercolor highlight and midrib. */
export function LeafShape({ variant, colorClass, detailed = false, className }: LeafShapeProps) {
  const { outline, midrib, veins } = leafPaths[variant]
  return (
    <svg viewBox="0 0 40 40" className={cn('block size-full overflow-visible', className)} aria-hidden="true">
      <path d={outline} className={colorClass} />
      {/* Lighter wash over one half, darker over the other, like pooled pigment. */}
      <path d={outline} className="fill-surface" opacity="0.2" style={{ clipPath: 'inset(0 50% 0 0)' }} />
      {detailed && (
        <>
          <path d={outline} className="fill-brand-950" opacity="0.1" style={{ clipPath: 'inset(0 0 0 50%)' }} />
          <path d={veins} className="stroke-brand-950/25" strokeWidth="0.7" strokeLinecap="round" fill="none" />
          <path d={outline} className="stroke-brand-950/20" strokeWidth="0.6" fill="none" />
        </>
      )}
      <path d={midrib} className="stroke-brand-950/35" strokeWidth={detailed ? 1.1 : 1} strokeLinecap="round" fill="none" />
    </svg>
  )
}
