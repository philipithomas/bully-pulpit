import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-muted text-gray-700',
        outline: 'border-border text-gray-700',
        success: 'border-forest/20 bg-forest/10 text-forest',
        warning: 'border-brass/40 bg-brass/15 text-walnut',
        destructive: 'border-red/20 bg-red/10 text-red-deep',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
