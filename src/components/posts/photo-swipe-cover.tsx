'use client'

import { useRouter } from 'next/navigation'
import {
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useTransition,
} from 'react'
import { usePhotoSwipe } from '@/components/ui/use-photo-swipe'

export interface PhotoSwipeDestination {
  href: string
  srcSet?: string
  sizes?: string
}

interface PhotoSwipeCoverProps {
  slug: string
  older: PhotoSwipeDestination | null
  newer: PhotoSwipeDestination | null
  children: ReactNode
}

/** Keeps the image server-rendered while adding touch navigation to its cover. */
export function PhotoSwipeCover({
  slug,
  older,
  newer,
  children,
}: PhotoSwipeCoverProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const navigating = useRef(false)
  const warmed = useRef(new Set<string>())

  useEffect(() => {
    if (!isPending) navigating.current = false
  }, [isPending])

  // App Router preserves this client component when another [slug] loads.
  useEffect(() => {
    navigating.current = false
    warmed.current.clear()
    warmed.current.add(`/${encodeURIComponent(slug)}`)
  }, [slug])

  const warmNeighbors = useCallback(() => {
    for (const destination of [older, newer]) {
      if (!destination || warmed.current.has(destination.href)) continue
      warmed.current.add(destination.href)
      router.prefetch(destination.href)
      if (destination.srcSet) {
        const image = new window.Image()
        image.sizes = destination.sizes ?? ''
        image.srcset = destination.srcSet
      }
    }
  }, [older, newer, router])

  const swipe = usePhotoSwipe({
    enabled: Boolean(older && newer),
    onSwipe(direction) {
      const destination = direction === 1 ? older : newer
      if (!destination || navigating.current || isPending) return
      navigating.current = true
      startTransition(() => {
        // An anchor keeps the next photo in view even on Tsundoku, where the
        // cover follows the post's header. Native Back retains scroll history.
        router.push(`${destination.href}#photo`)
      })
    },
  })

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      swipe.onPointerDown(event)
      if (event.pointerType === 'touch') warmNeighbors()
    },
    [swipe.onPointerDown, warmNeighbors]
  )

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: Each standalone photo page has exactly one cover and a permanent navigation anchor.
    <div
      id="photo"
      className="scroll-mt-24"
      style={{ touchAction: 'pan-y pinch-zoom' }}
      aria-busy={isPending || undefined}
      {...swipe}
      onPointerDown={onPointerDown}
    >
      {children}
      <span aria-live="polite" className="sr-only">
        {isPending ? 'Loading photo…' : ''}
      </span>
    </div>
  )
}
