import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ParallaxLayerProps {
  /** How far (px) this layer lags behind the page over the first screen of scrolling. 0 moves with the page. */
  shift: number
  className?: string
  children: ReactNode
}

/**
 * A scroll-linked parallax wrapper (see .parallax-layer in index.css). It owns
 * only the scroll transform, so entrance animations belong on a child element.
 * In browsers without scroll-driven animations it simply stays still.
 */
export function ParallaxLayer({ shift, className, children }: ParallaxLayerProps) {
  return (
    <div className={cn('parallax-layer', className)} style={{ '--parallax-shift': `${shift}px` } as CSSProperties}>
      {children}
    </div>
  )
}
