'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import type { ReactNode } from 'react'
import { isValidElement } from 'react'
import { cn } from '@/lib/utils'

function slottedChildren(children: ReactNode) {
  if (!isValidElement<{ children?: ReactNode }>(children)) return undefined
  return children.props.children
}

function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  asChild,
  children,
  render,
  ...props
}: MenuPrimitive.Trigger.Props & { asChild?: boolean }) {
  const childRender = asChild && isValidElement(children) ? children : render
  const renderedChildren =
    childRender === children ? slottedChildren(children) : children

  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      render={childRender}
      {...props}
    >
      {renderedChildren ?? null}
    </MenuPrimitive.Trigger>
  )
}

function DropdownMenuPortal(props: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

type DropdownMenuContentProps = MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    | 'align'
    | 'alignOffset'
    | 'collisionBoundary'
    | 'collisionPadding'
    | 'side'
    | 'sideOffset'
  >

function DropdownMenuContent({
  align = 'end',
  alignOffset,
  className,
  collisionBoundary,
  collisionPadding = 8,
  side = 'bottom',
  sideOffset = 6,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        className="z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            'max-h-[var(--available-height)] min-w-44 origin-[var(--transform-origin)] overflow-y-auto border border-border bg-popover p-1 text-popover-foreground outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuItem({
  asChild,
  children,
  className,
  inset,
  render,
  variant = 'default',
  ...props
}: MenuPrimitive.Item.Props & {
  asChild?: boolean
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  const childRender = asChild && isValidElement(children) ? children : render
  const renderedChildren =
    childRender === children ? slottedChildren(children) : children

  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset ? '' : undefined}
      data-no-focus-ring
      data-variant={variant}
      render={childRender}
      className={cn(
        'relative flex min-h-11 cursor-default select-none items-center gap-2 px-3 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:bg-destructive/10 sm:min-h-9 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className
      )}
      {...props}
    >
      {renderedChildren ?? null}
    </MenuPrimitive.Item>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<'div'> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset ? '' : undefined}
      className={cn(
        'px-3 py-2 text-sm font-semibold data-[inset]:pl-8',
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'ml-auto font-mono text-xs text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
}
