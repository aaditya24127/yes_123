import { useRef, type CSSProperties, type HTMLAttributes, type RefObject } from 'react'
import { useInViewAttribute } from '@/hooks/useInViewAttribute'
import { cn } from '@/lib/cn'

export type RevealVariant = 'rise' | 'drop' | 'fade' | 'scale' | 'left' | 'right' | 'settle'

const fromTransforms: Record<RevealVariant, string> = {
  rise: 'translate3d(0, 28px, 0)',
  drop: 'translate3d(0, -32px, 0)',
  fade: 'none',
  scale: 'scale(0.96)',
  left: 'translate3d(-36px, 0, 0)',
  right: 'translate3d(36px, 0, 0)',
  // Drops from above with extra rotation, then swings to rest (see .reveal-settle).
  settle: 'translate3d(0, -36px, 0) rotate(var(--settle-rotate, -4deg))',
}

interface RevealProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'li' | 'ol' | 'ul' | 'section' | 'figure' | 'header'
  variant?: RevealVariant
  /**
   * Stagger delay in ms. Leave unset to let CSS provide --reveal-delay, e.g. a
   * different delay per breakpoint.
   */
  delay?: number
}

/**
 * Fades and moves its content into place the first time it scrolls into view.
 * Styles live in `.reveal` (index.css); children can also key off `[data-inview]`.
 */
export function Reveal({ as = 'div', variant = 'rise', delay, className, style, children, ...props }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  useInViewAttribute(ref, { once: true, rootMargin: '0px 0px -12% 0px' })

  const revealStyle = {
    '--reveal-from': fromTransforms[variant],
    ...(delay === undefined ? {} : { '--reveal-delay': `${delay}ms` }),
    ...style,
  } as CSSProperties

  // Every allowed tag renders an HTMLElement, so one concrete tag type covers them for typing.
  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as RefObject<HTMLDivElement>}
      className={cn('reveal', variant === 'settle' && 'reveal-settle', className)}
      style={revealStyle}
      {...props}
    >
      {children}
    </Tag>
  )
}
