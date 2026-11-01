import { useRef, type CSSProperties } from 'react'
import { useInViewAttribute } from '@/hooks/useInViewAttribute'
import { cn } from '@/lib/cn'
import { LeafShape, type LeafVariant } from './LeafShape'

/** far: small, soft, faint. mid: medium. near: large, detailed, crisp. */
export type LeafDepth = 'far' | 'mid' | 'near'

export interface LeafConfig {
  depth: LeafDepth
  variant: LeafVariant
  colorClass: string
  /** Horizontal start position, % of the container width. */
  x: number
  /** Resting position for reduced motion, % of the container height. */
  y: number
  /** Size in px. */
  size: number
  opacity: number
  /** Seconds for one full fall through the container. */
  fall: number
  /** Seconds for one side-to-side swing. */
  sway: number
  /** Negative delays start leaves mid-fall so the scene is populated on load. */
  delay: number
  /** Horizontal swing amplitude, px. */
  swing: number
  /** Rotation amplitude, degrees. */
  spin: number
  /** Net horizontal drift over the whole fall, px. */
  drift: number
  /** Hide below a breakpoint, where the leaf would cross content. */
  hideBelow?: 'md' | 'xl'
}

const depthClasses: Record<LeafDepth, string> = {
  far: 'blur-[0.6px]',
  mid: '',
  near: 'drop-shadow-[0_6px_6px_rgb(26_51_38/0.18)]',
}

const hideBelowClasses = { md: 'max-md:hidden', xl: 'max-xl:hidden' }

type LeafStyle = CSSProperties & Record<`--${string}`, string>

function leafStyle(leaf: LeafConfig): LeafStyle {
  return {
    '--leaf-x': `${leaf.x}%`,
    '--leaf-y': `${leaf.y}%`,
    '--leaf-size': `${leaf.size}px`,
    '--leaf-opacity': `${leaf.opacity}`,
    '--leaf-fall': `${leaf.fall}s`,
    '--leaf-sway': `${leaf.sway}s`,
    '--leaf-delay': `${leaf.delay}s`,
    '--leaf-swing': `${leaf.swing}px`,
    '--leaf-spin': `${leaf.spin}deg`,
    '--leaf-drift': `${leaf.drift}px`,
  }
}

interface FallingLeavesProps {
  leaves: LeafConfig[]
  className?: string
}

/**
 * Decorative drifting leaves, animated purely with CSS (see .leaf in index.css).
 * The layer is a size container, so leaves fall its full height whatever the
 * section size. Animations pause while the layer is out of view.
 */
export function FallingLeaves({ leaves, className }: FallingLeavesProps) {
  const ref = useRef<HTMLDivElement>(null)
  useInViewAttribute(ref)

  return (
    <div ref={ref} aria-hidden="true" className={cn('leaves pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {leaves.map((leaf) => (
        <div
          key={`${leaf.x}-${leaf.y}`}
          className={cn('leaf', depthClasses[leaf.depth], leaf.hideBelow && hideBelowClasses[leaf.hideBelow])}
          style={leafStyle(leaf)}
        >
          <div className="leaf-sway">
            <LeafShape variant={leaf.variant} colorClass={leaf.colorClass} detailed={leaf.depth === 'near'} />
          </div>
        </div>
      ))}
    </div>
  )
}
