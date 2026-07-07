'use client'

import { Dialog as SheetPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { isValidElement } from 'react'
import { cn } from '@/lib/utils'

function slottedChildren(children: ReactNode) {
  if (!isValidElement<{ children?: ReactNode }>(children)) return undefined
  return children.props.children
}

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  asChild,
  children,
  render,
  ...props
}: SheetPrimitive.Trigger.Props & { asChild?: boolean }) {
  const childRender = asChild && isValidElement(children) ? children : render
  const renderedChildren =
    childRender === children ? slottedChildren(children) : children

  return (
    <SheetPrimitive.Trigger
      data-slot="sheet-trigger"
      render={childRender}
      {...props}
    >
      {renderedChildren ?? null}
    </SheetPrimitive.Trigger>
  )
}

function SheetClose({
  asChild,
  children,
  render,
  ...props
}: SheetPrimitive.Close.Props & { asChild?: boolean }) {
  const childRender = asChild && isValidElement(children) ? children : render
  const renderedChildren =
    childRender === children ? slottedChildren(children) : children

  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      render={childRender}
      {...props}
    >
      {renderedChildren ?? null}
    </SheetPrimitive.Close>
  )
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Backdrop>) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className
      )}
      {...props}
    />
  )
}

const sheetSideClasses = {
  top: 'inset-x-0 top-0 border-b border-border data-[ending-style]:-translate-y-full data-[starting-style]:-translate-y-full',
  right:
    'inset-y-0 right-0 w-72 max-w-[85vw] border-l border-border data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full',
  bottom:
    'inset-x-0 bottom-0 border-t border-border data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full',
  left: 'inset-y-0 left-0 w-72 max-w-[85vw] border-r border-border data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full',
}

function SheetContent({
  className,
  children,
  side = 'left',
  showCloseButton = true,
  title = 'Menu',
  ...props
}: Omit<SheetPrimitive.Popup.Props, 'title'> & {
  side?: keyof typeof sheetSideClasses
  showCloseButton?: boolean
  title?: string
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col bg-background shadow-xl outline-none transition-[opacity,transform] duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
          sheetSideClasses[side],
          className
        )}
        {...props}
      >
        <SheetPrimitive.Title className="sr-only">{title}</SheetPrimitive.Title>
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close className="absolute right-4 top-4 -m-2 p-2 text-gray-600 transition-colors hover:text-gray-950">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2', className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        'font-sans text-xl font-semibold tracking-tight text-gray-950',
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
