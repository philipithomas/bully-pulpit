import { ChevronDown } from 'lucide-react'
import type * as React from 'react'
import { cn } from '@/lib/utils'

function NativeSelect({
  className,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'select'>, 'size'> & {
  size?: 'default' | 'sm'
}) {
  return (
    <div
      data-slot="native-select-wrapper"
      className="relative block w-full has-[select:disabled]:opacity-50"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          'h-10 w-full min-w-0 appearance-none border border-input bg-background px-3 py-2 pr-9 text-base text-foreground transition-colors disabled:cursor-not-allowed data-[size=sm]:h-9 data-[size=sm]:py-1 aria-invalid:border-destructive sm:text-sm',
          className
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        data-slot="native-select-icon"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<'option'>) {
  return (
    <option
      data-slot="native-select-option"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn('bg-[Canvas] text-[CanvasText]', className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
