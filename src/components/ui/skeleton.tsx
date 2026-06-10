import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/**
 * Pulsing placeholder block for content that is still loading. Rendered as a
 * span (display block) so it can sit inside paragraphs; square corners and
 * the warm gray per the editorial pass.
 */
export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse bg-gray-100', className)}
      {...props}
    />
  )
}
