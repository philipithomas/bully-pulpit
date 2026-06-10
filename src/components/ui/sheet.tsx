'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = 'left',
  title = 'Menu',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right'
  /** Accessible name for the drawer (Radix requires a DialogTitle). */
  title?: string
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        // No description element exists; undefined stops Radix pointing
        // aria-describedby at a nonexistent id (and warning about it).
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
          side === 'left'
            ? 'left-0 border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
            : 'right-0 border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          className
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">
          {title}
        </DialogPrimitive.Title>
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 -m-2 p-2 text-gray-600 transition-colors hover:text-gray-950">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </SheetPortal>
  )
}

export { Sheet, SheetClose, SheetContent, SheetTrigger }
