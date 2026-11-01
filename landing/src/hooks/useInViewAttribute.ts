import { useEffect, type RefObject } from 'react'

interface Options {
  /** Keep the attribute once set (entrance reveals) instead of toggling it. */
  once?: boolean
  rootMargin?: string
  threshold?: number
}

/**
 * Sets `data-inview` on the element while it is in the viewport.
 * Writes the attribute directly so scrolling never triggers React re-renders;
 * CSS reacts to the attribute.
 */
export function useInViewAttribute(ref: RefObject<Element | null>, { once = false, rootMargin, threshold }: Options = {}) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        element.toggleAttribute('data-inview', entry.isIntersecting || (once && element.hasAttribute('data-inview')))
        if (once && entry.isIntersecting) observer.disconnect()
      },
      { rootMargin, threshold },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, once, rootMargin, threshold])
}
