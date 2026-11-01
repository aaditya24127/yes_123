import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'
import { buttonStyles, type ButtonStyleOptions } from './buttonStyles'

export interface ButtonProps extends ComponentPropsWithoutRef<'button'>, ButtonStyleOptions {}

export function Button({ variant, size, type = 'button', className, ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonStyles({ variant, size }), className)} {...props} />
}
