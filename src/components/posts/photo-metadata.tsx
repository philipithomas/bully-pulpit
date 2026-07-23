'use client'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
    <TooltipProvider>
      <ul
        aria-label="Photo metadata"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[11px] leading-5',
          tone === 'dark' ? 'text-white/65' : 'text-gray-500',
          align === 'center' && 'justify-center',
          align === 'end' && 'justify-end',
          className
        )}
      >
        {items.map((item) => (
          <li key={item.key}>
            {item.estimated ? (
              <Tooltip>
                <TooltipTrigger
                  type="button"
                  aria-label={`${item.label}: ${item.value}, estimated`}
                  className={cn(
                    'cursor-help appearance-none border-0 bg-transparent p-0 text-inherit underline decoration-dotted underline-offset-2',
                    tone === 'dark'
                      ? 'decoration-white/45'
                      : 'decoration-gray-400'
                  )}
                >
                  {item.value}
                </TooltipTrigger>
                <TooltipContent>Estimated aperture</TooltipContent>
              </Tooltip>
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
    </TooltipProvider>
  )
}
