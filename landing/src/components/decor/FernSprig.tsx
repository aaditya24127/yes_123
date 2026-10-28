import { cn } from '@/lib/cn'

const LEAFLETS = 11

// Quadratic Bézier stem from the base (bottom-left) to the tip (top-right).
const P0 = [24, 236]
const P1 = [40, 90]
const P2 = [150, 14]

function pointAt(t: number): [number, number] {
  const u = 1 - t
  return [u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]
}

function angleAt(t: number): number {
  const dx = 2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0])
  const dy = 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

const leaflets = Array.from({ length: LEAFLETS }, (_, i) => {
  const t = (i + 1) / (LEAFLETS + 1)
  const [x, y] = pointAt(t)
  return { x, y, angle: angleAt(t), length: 34 * (1 - t * 0.65) }
})

/** A botanical fern frond, used as a quiet corner detail. */
export function FernSprig({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 170 250" className={cn('pointer-events-none', className)} aria-hidden="true">
      <path
        d={`M${P0[0]} ${P0[1]}Q${P1[0]} ${P1[1]} ${P2[0]} ${P2[1]}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <g fill="currentColor">
        {leaflets.map(({ x, y, angle, length }) =>
          [-58, 58].map((offset) => (
            <ellipse
              key={`${x}-${offset}`}
              cx="0"
              cy={-length / 2}
              rx={length * 0.2}
              ry={length / 2}
              transform={`translate(${x} ${y}) rotate(${angle + offset + 90})`}
            />
          )),
        )}
      </g>
    </svg>
  )
}
