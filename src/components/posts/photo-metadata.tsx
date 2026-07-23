'use client'

import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { photoMetadataItems } from '@/lib/content/photo-metadata'
import type { PhotoMetadata as PhotoMetadataValue } from '@/lib/content/types'
import { cn } from '@/lib/utils'

export function PhotoMetadata({
  photo,
  tone = 'light',
  align = 'start',
  className,
}: {
  photo: PhotoMetadataValue | null | undefined
  tone?: 'light' | 'dark'
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  const items = photoMetadataItems(photo)
  if (items.length === 0) return null

  return (
    <ul
      aria-label="Photo metadata"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] leading-5 tabular-nums',
        tone === 'dark' ? 'text-white/65' : 'text-gray-500',
        align === 'center' && 'justify-center',
        align === 'end' && 'justify-end',
        className
      )}
    >
      {items.map((item) => (
        <li key={item.key}>
          {item.estimated ? (
            <Popover>
              <PopoverTrigger
                type="button"
                openOnHover
                delay={300}
                closeDelay={100}
                aria-label={`${item.label}: ${item.value}, estimated`}
                className={cn(
                  "relative cursor-help touch-manipulation appearance-none border-0 bg-transparent p-0 text-inherit underline decoration-dotted underline-offset-2 after:absolute after:top-1/2 after:left-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
                  tone === 'dark'
                    ? 'decoration-white/45'
                    : 'decoration-gray-400'
                )}
              >
                {item.value}
              </PopoverTrigger>
              <PopoverContent>
                <PopoverTitle>Estimated aperture</PopoverTitle>
              </PopoverContent>
            </Popover>
          ) : (
            <>
              {item.key === 'iso' ? null : (
                <span className="sr-only">{item.label}: </span>
              )}
              {item.value}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
