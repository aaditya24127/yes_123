import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { buttonStyles, type ButtonStyleOptions } from './buttonStyles'

export interface ButtonLinkProps extends ComponentPropsWithoutRef<'a'>, ButtonStyleOptions {}

/** An anchor styled as a button, for navigation actions. */
export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <a className={cn(buttonStyles({ variant, size }), className)} {...props} />
}
