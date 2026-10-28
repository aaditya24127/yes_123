import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonStyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-800 text-background shadow-card hover:bg-brand-900',
  secondary: 'border border-brand-800/20 bg-surface/70 text-brand-900 hover:border-brand-800/40 hover:bg-surface',
  ghost: 'text-brand-800 hover:bg-brand-50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
}

/** Shared button classes, used by both <Button> and <ButtonLink>. */
export function buttonStyles({ variant = 'primary', size = 'md' }: ButtonStyleOptions = {}): string {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
    variantClasses[variant],
    sizeClasses[size],
  )
}
