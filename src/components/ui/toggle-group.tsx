'use client'

import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { cva, type VariantProps } from 'class-variance-authority'
import { createContext, type ReactNode, useCallback, useContext } from 'react'
import { cn } from '@/lib/utils'

const toggleGroupItemVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-transparent text-foreground hover:bg-accent data-[pressed]:bg-primary data-[pressed]:text-primary-foreground',
        outline:
          'border border-input bg-background text-foreground hover:bg-accent data-[pressed]:border-primary data-[pressed]:bg-primary data-[pressed]:text-primary-foreground',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  }
)

type ToggleStyleProps = VariantProps<typeof toggleGroupItemVariants>

const ToggleGroupStyleContext = createContext<ToggleStyleProps>({
  size: 'default',
  variant: 'outline',
})

type ToggleGroupSharedProps = Omit<
  ToggleGroupPrimitive.Props<string>,
  'defaultValue' | 'multiple' | 'onValueChange' | 'value'
> &
  ToggleStyleProps & {
    children?: ReactNode
  }

type ToggleGroupSingleProps = ToggleGroupSharedProps & {
  type: 'single'
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

type ToggleGroupMultipleProps = ToggleGroupSharedProps & {
  type: 'multiple'
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (value: string[]) => void
}

type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps

function ToggleGroup({
  children,
  className,
  defaultValue,
  onValueChange,
  size = 'default',
  type,
  value,
  variant = 'outline',
  ...props
}: ToggleGroupProps) {
  const commonProps = {
    ...props,
    className: cn(
      'inline-flex w-fit items-center [&>[data-slot=toggle-group-item]+[data-slot=toggle-group-item]]:-ml-px',
      className
    ),
    'data-slot': 'toggle-group',
  }

  const content = (
    <ToggleGroupStyleContext.Provider value={{ size, variant }}>
      {children}
    </ToggleGroupStyleContext.Provider>
  )

  const handleValueChange = useCallback(
    (nextValue: string[]) => {
      if (type === 'multiple') {
        onValueChange?.(nextValue)
      } else {
        onValueChange?.(nextValue[0] ?? '')
      }
    },
    [onValueChange, type]
  )

  if (type === 'multiple') {
    return (
      <ToggleGroupPrimitive
        {...commonProps}
        multiple
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
      >
        {content}
      </ToggleGroupPrimitive>
    )
  }

  return (
    <ToggleGroupPrimitive
      {...commonProps}
      multiple={false}
      value={value === undefined ? undefined : value ? [value] : []}
      defaultValue={
        defaultValue === undefined
          ? undefined
          : defaultValue
            ? [defaultValue]
            : []
      }
      onValueChange={handleValueChange}
    >
      {content}
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  size,
  variant,
  ...props
}: TogglePrimitive.Props & ToggleStyleProps) {
  const context = useContext(ToggleGroupStyleContext)

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      className={cn(
        toggleGroupItemVariants({
          size: size ?? context.size,
          variant: variant ?? context.variant,
        }),
        className
      )}
      {...props}
    />
  )
}

export {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupProps,
  toggleGroupItemVariants,
}
