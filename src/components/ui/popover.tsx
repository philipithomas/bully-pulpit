'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  side = 'top',
  sideOffset = 8,
  align = 'center',
  alignOffset = 0,
  collisionPadding = 8,
  children,
  initialFocus = false,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Popup> &
  Pick<
    PopoverPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'collisionPadding' | 'side' | 'sideOffset'
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[80]"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          initialFocus={initialFocus}
          className={cn(
            'z-[80] w-fit max-w-[calc(100vw-2rem)] origin-(--transform-origin) border border-white/10 bg-gray-950 px-3 py-2 text-balance text-center font-sans text-[11px] leading-4 text-white outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('font-normal', className)}
      {...props}
    />
  )
}

export { Popover, PopoverContent, PopoverTitle, PopoverTrigger }
