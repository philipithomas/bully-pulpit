'use client'

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { isValidElement } from 'react'
import { cn } from '@/lib/utils'

function slottedChildren(children: ReactNode) {
  if (!isValidElement<{ children?: ReactNode }>(children)) return undefined
  return children.props.children
}

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  asChild,
  children,
  render,
  ...props
}: DialogPrimitive.Trigger.Props & { asChild?: boolean }) {
  const childRender = asChild && isValidElement(children) ? children : render
  const renderedChildren =
    childRender === children ? slottedChildren(children) : children

  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      render={childRender}
      {...props}
    >
      {renderedChildren ?? null}
    </DialogPrimitive.Trigger>
  )
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  asChild,
  children,
  render,
  ...props
}: DialogPrimitive.Close.Props & { asChild?: boolean }) {
  const childRender = asChild && isValidElement(children) ? children : render
  const renderedChildren =
    childRender === children ? slottedChildren(children) : children

  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={childRender}
      {...props}
    >
      {renderedChildren ?? null}
    </DialogPrimitive.Close>
  )
}

function DialogOverlay({
  className,
  ref,
  ...props
}: ComponentProps<typeof DialogPrimitive.Backdrop>) {
  return (
    <DialogPrimitive.Backdrop
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/50 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ref,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 bg-card p-8 shadow-xl outline-none transition-[opacity,transform] duration-200 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close className="absolute right-4 top-4 -m-2 p-2 text-gray-600 transition-colors hover:text-gray-950">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-header"
    className={cn('flex flex-col gap-2 text-center', className)}
    {...props}
  />
)

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-slot="dialog-footer"
    className={cn(
      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className
    )}
    {...props}
  />
)

function DialogTitle({
  className,
  ref,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn(
        'font-sans text-xl font-semibold tracking-tight text-gray-950',
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ref,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
