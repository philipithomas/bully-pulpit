import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline:
          'border border-input bg-background text-foreground hover:bg-accent',
        ghost: 'text-foreground hover:bg-accent',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-5',
        sm: 'h-9 px-3',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { buttonVariants }
