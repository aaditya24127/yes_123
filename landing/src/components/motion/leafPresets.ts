import type { LeafConfig } from './FallingLeaves'

/*
 * Leaf arrangements per section. Sizes follow three depth tiers:
 * far 21–32px (faint, slightly soft), mid 36–48px, near 56–76px (detailed).
 * Layers placed behind content use far and mid leaves; only the hero's
 * front layer uses near leaves, kept to the illustration's right edge.
 * Leaves marked hideBelow: 'md' thin the scene out on phones.
 */

export const heroBackLeaves: LeafConfig[] = [
  { depth: 'far', variant: 'ovate', colorClass: 'fill-brand-500', x: 6, y: 18, size: 27, opacity: 0.5, fall: 26, sway: 5.5, delay: -3, swing: 22, spin: 24, drift: 40 },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-sage-400', x: 18, y: 62, size: 22, opacity: 0.42, fall: 30, sway: 6, delay: -14, swing: 18, spin: 30, drift: -30 },
  { depth: 'mid', variant: 'peepal', colorClass: 'fill-teal-500', x: 31, y: 8, size: 39, opacity: 0.6, fall: 23, sway: 5, delay: -8, swing: 26, spin: 20, drift: 50 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-accent-400', x: 44, y: 74, size: 21, opacity: 0.42, fall: 28, sway: 6.5, delay: -20, swing: 16, spin: 36, drift: 20 },
  { depth: 'mid', variant: 'lanceolate', colorClass: 'fill-brand-400', x: 57, y: 30, size: 42, opacity: 0.62, fall: 24, sway: 5.2, delay: -5, swing: 24, spin: 26, drift: -40 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-sage-500', x: 69, y: 55, size: 25, opacity: 0.45, fall: 31, sway: 6.2, delay: -17, swing: 20, spin: 32, drift: 30 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-teal-400', x: 80, y: 12, size: 32, opacity: 0.5, fall: 25, sway: 5.6, delay: -11, swing: 28, spin: 22, drift: -20 },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-accent-300', x: 91, y: 46, size: 22, opacity: 0.45, fall: 29, sway: 6.8, delay: -24, swing: 18, spin: 28, drift: 36 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-brand-300', x: 50, y: 90, size: 27, opacity: 0.4, fall: 33, sway: 5.8, delay: -28, swing: 22, spin: 34, drift: -26 },
  { depth: 'mid', variant: 'lanceolate', colorClass: 'fill-sage-500', x: 2, y: 84, size: 45, opacity: 0.6, fall: 21, sway: 4.4, delay: -2, swing: 30, spin: 34, drift: 70 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-brand-400', x: 12, y: 40, size: 24, opacity: 0.45, fall: 29, sway: 6.1, delay: -21, swing: 20, spin: 28, drift: 26, hideBelow: 'md' },
  { depth: 'mid', variant: 'ovate', colorClass: 'fill-teal-400', x: 24, y: 26, size: 38, opacity: 0.55, fall: 24, sway: 5.3, delay: -12, swing: 26, spin: 24, drift: -34, hideBelow: 'md' },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-clay-300', x: 38, y: 52, size: 23, opacity: 0.42, fall: 31, sway: 6.6, delay: -26, swing: 18, spin: 32, drift: 22, hideBelow: 'md' },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-sage-400', x: 63, y: 82, size: 26, opacity: 0.45, fall: 27, sway: 5.9, delay: -16, swing: 22, spin: 26, drift: -28, hideBelow: 'md' },
  { depth: 'mid', variant: 'peepal', colorClass: 'fill-accent-400', x: 74, y: 36, size: 40, opacity: 0.58, fall: 23, sway: 5.1, delay: -19, swing: 28, spin: 30, drift: 36, hideBelow: 'md' },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-teal-500', x: 96, y: 20, size: 25, opacity: 0.45, fall: 28, sway: 6.3, delay: -7, swing: 20, spin: 26, drift: -22 },
]

// Over the landscape's right edge only, clear of the copy and dashboard.
export const heroFrontLeaves: LeafConfig[] = [
  { depth: 'near', variant: 'peepal', colorClass: 'fill-brand-600', x: 86, y: 20, size: 64, opacity: 0.92, fall: 19, sway: 4.6, delay: -6, swing: 30, spin: 28, drift: -18, hideBelow: 'xl' },
  { depth: 'near', variant: 'ovate', colorClass: 'fill-teal-600', x: 94, y: 68, size: 73, opacity: 0.88, fall: 22, sway: 5, delay: -13, swing: 28, spin: 22, drift: -40, hideBelow: 'xl' },
  { depth: 'near', variant: 'ovate', colorClass: 'fill-accent-500', x: 89, y: 42, size: 56, opacity: 0.9, fall: 17, sway: 4.2, delay: -10, swing: 24, spin: 38, drift: 20, hideBelow: 'xl' },
  { depth: 'near', variant: 'lanceolate', colorClass: 'fill-sage-500', x: 92, y: 78, size: 60, opacity: 0.88, fall: 20, sway: 4.8, delay: -16, swing: 24, spin: 30, drift: -20, hideBelow: 'xl' },
  { depth: 'near', variant: 'peepal', colorClass: 'fill-brand-500', x: 97, y: 50, size: 66, opacity: 0.85, fall: 21, sway: 4.4, delay: -3, swing: 26, spin: 26, drift: -36, hideBelow: 'xl' },
]

export const featureLeaves: LeafConfig[] = [
  { depth: 'mid', variant: 'peepal', colorClass: 'fill-brand-400', x: 8, y: 20, size: 42, opacity: 0.55, fall: 26, sway: 5.4, delay: -9, swing: 26, spin: 26, drift: 40 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-accent-300', x: 27, y: 70, size: 25, opacity: 0.45, fall: 30, sway: 6.2, delay: -18, swing: 20, spin: 30, drift: -24 },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-teal-400', x: 48, y: 40, size: 28, opacity: 0.45, fall: 28, sway: 5.8, delay: -4, swing: 22, spin: 24, drift: 30 },
  { depth: 'mid', variant: 'ovate', colorClass: 'fill-sage-500', x: 71, y: 12, size: 39, opacity: 0.55, fall: 24, sway: 5, delay: -14, swing: 28, spin: 32, drift: -36 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-clay-300', x: 90, y: 58, size: 27, opacity: 0.45, fall: 31, sway: 6.6, delay: -22, swing: 18, spin: 28, drift: 20 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-teal-500', x: 18, y: 44, size: 26, opacity: 0.42, fall: 30, sway: 6, delay: -27, swing: 20, spin: 26, drift: 24, hideBelow: 'md' },
  { depth: 'mid', variant: 'lanceolate', colorClass: 'fill-accent-400', x: 60, y: 78, size: 38, opacity: 0.5, fall: 25, sway: 5.4, delay: -6, swing: 26, spin: 30, drift: -30, hideBelow: 'md' },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-sage-400', x: 82, y: 30, size: 24, opacity: 0.42, fall: 28, sway: 6.4, delay: -11, swing: 20, spin: 24, drift: 28, hideBelow: 'md' },
]

export const processLeaves: LeafConfig[] = [
  { depth: 'far', variant: 'ovate', colorClass: 'fill-sage-400', x: 4, y: 30, size: 28, opacity: 0.45, fall: 27, sway: 5.6, delay: -6, swing: 22, spin: 26, drift: 30 },
  { depth: 'mid', variant: 'lanceolate', colorClass: 'fill-teal-500', x: 36, y: 80, size: 39, opacity: 0.5, fall: 25, sway: 5.2, delay: -16, swing: 26, spin: 30, drift: -30 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-accent-400', x: 64, y: 16, size: 25, opacity: 0.45, fall: 29, sway: 6, delay: -11, swing: 20, spin: 24, drift: 24 },
  { depth: 'mid', variant: 'ovate', colorClass: 'fill-brand-400', x: 95, y: 52, size: 42, opacity: 0.5, fall: 23, sway: 4.8, delay: -2, swing: 28, spin: 34, drift: -40 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-sage-500', x: 20, y: 60, size: 25, opacity: 0.42, fall: 30, sway: 6.2, delay: -21, swing: 20, spin: 28, drift: 26, hideBelow: 'md' },
  { depth: 'mid', variant: 'ovate', colorClass: 'fill-accent-300', x: 80, y: 24, size: 38, opacity: 0.5, fall: 24, sway: 5, delay: -9, swing: 26, spin: 30, drift: -30, hideBelow: 'md' },
]

export const impactLeaves: LeafConfig[] = [
  { depth: 'mid', variant: 'peepal', colorClass: 'fill-accent-300', x: 6, y: 24, size: 42, opacity: 0.55, fall: 25, sway: 5.2, delay: -7, swing: 26, spin: 28, drift: 40 },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-sage-300', x: 22, y: 70, size: 28, opacity: 0.4, fall: 29, sway: 6, delay: -19, swing: 20, spin: 30, drift: -28 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-brand-300', x: 46, y: 10, size: 31, opacity: 0.35, fall: 27, sway: 5.8, delay: -12, swing: 22, spin: 24, drift: 26 },
  { depth: 'mid', variant: 'ovate', colorClass: 'fill-teal-300', x: 68, y: 46, size: 39, opacity: 0.45, fall: 24, sway: 5, delay: -3, swing: 28, spin: 32, drift: -36 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-clay-200', x: 84, y: 84, size: 27, opacity: 0.4, fall: 30, sway: 6.4, delay: -24, swing: 18, spin: 26, drift: 22 },
  { depth: 'mid', variant: 'lanceolate', colorClass: 'fill-accent-200', x: 96, y: 30, size: 42, opacity: 0.5, fall: 22, sway: 4.6, delay: -15, swing: 26, spin: 34, drift: -44 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-sage-300', x: 14, y: 48, size: 26, opacity: 0.4, fall: 28, sway: 6, delay: -14, swing: 20, spin: 26, drift: 22, hideBelow: 'md' },
  { depth: 'mid', variant: 'peepal', colorClass: 'fill-teal-300', x: 34, y: 30, size: 38, opacity: 0.45, fall: 25, sway: 5.4, delay: -22, swing: 26, spin: 30, drift: -30, hideBelow: 'md' },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-accent-300', x: 58, y: 76, size: 25, opacity: 0.42, fall: 30, sway: 6.4, delay: -5, swing: 20, spin: 28, drift: 26, hideBelow: 'md' },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-brand-300', x: 76, y: 16, size: 27, opacity: 0.38, fall: 29, sway: 6.1, delay: -26, swing: 22, spin: 24, drift: -24 },
]

export const ctaLeaves: LeafConfig[] = [
  { depth: 'mid', variant: 'ovate', colorClass: 'fill-brand-500', x: 5, y: 34, size: 45, opacity: 0.55, fall: 24, sway: 5.2, delay: -5, swing: 26, spin: 28, drift: 44 },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-accent-400', x: 18, y: 12, size: 28, opacity: 0.45, fall: 29, sway: 6, delay: -15, swing: 20, spin: 26, drift: -24 },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-teal-400', x: 33, y: 62, size: 27, opacity: 0.42, fall: 31, sway: 6.4, delay: -22, swing: 22, spin: 30, drift: 30 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-sage-400', x: 64, y: 22, size: 29, opacity: 0.45, fall: 28, sway: 5.6, delay: -9, swing: 22, spin: 24, drift: -30 },
  { depth: 'mid', variant: 'peepal', colorClass: 'fill-teal-500', x: 80, y: 48, size: 42, opacity: 0.55, fall: 25, sway: 5, delay: -18, swing: 26, spin: 32, drift: -40 },
  { depth: 'far', variant: 'lanceolate', colorClass: 'fill-clay-300', x: 94, y: 14, size: 25, opacity: 0.42, fall: 30, sway: 6.6, delay: -1, swing: 18, spin: 28, drift: 20 },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-clay-300', x: 26, y: 40, size: 25, opacity: 0.42, fall: 30, sway: 6.2, delay: -12, swing: 20, spin: 26, drift: 24, hideBelow: 'md' },
  { depth: 'mid', variant: 'lanceolate', colorClass: 'fill-brand-400', x: 48, y: 20, size: 38, opacity: 0.5, fall: 24, sway: 5.2, delay: -25, swing: 26, spin: 30, drift: -30, hideBelow: 'md' },
  { depth: 'far', variant: 'peepal', colorClass: 'fill-sage-500', x: 72, y: 72, size: 26, opacity: 0.42, fall: 29, sway: 6, delay: -7, swing: 20, spin: 28, drift: 22, hideBelow: 'md' },
  { depth: 'far', variant: 'ovate', colorClass: 'fill-teal-500', x: 56, y: 86, size: 24, opacity: 0.42, fall: 31, sway: 6.6, delay: -17, swing: 18, spin: 24, drift: -20 },
]
