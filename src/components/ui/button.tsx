import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
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
        icon: 'size-10 shrink-0 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
    loadingLabel?: React.ReactNode
  }

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingLabel,
  disabled,
  children,
  'aria-busy': ariaBusy,
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-loading={loading ? '' : undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading ? true : ariaBusy}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center gap-2',
          loading && 'opacity-0'
        )}
        aria-hidden={loading || undefined}
      >
        {children}
      </span>
      {loading ? (
        <span
          className="absolute inset-0 inline-flex items-center justify-center gap-2 px-2"
          aria-live="polite"
        >
          <Spinner />
          {loadingLabel ?? <span className="sr-only">Loading</span>}
        </span>
      ) : null}
    </button>
  )
}

export { buttonVariants }
