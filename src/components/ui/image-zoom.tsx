'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ZoomedImage } from '@/components/ui/image-zoom-overlay'

// Keeps react-zoom-pan-pinch out of the shared first-load bundle;
// the chunk loads only when an image is actually zoomed.
const ImageZoomOverlay = dynamic(
  () =>
    import('@/components/ui/image-zoom-overlay').then(
      (m) => m.ImageZoomOverlay
    ),
  { ssr: false }
)

// Warm the browser cache for full-resolution variants on first hover or
// touch, so the overlay upgrade is usually instant by the time the visitor
// clicks. Deduped per URL for the life of the tab.
const warmed = new Set<string>()

function warmFullSrc(e: Event) {
  const target = (e.target as Partial<HTMLElement>).closest?.(
    '[data-full-src]'
  ) as HTMLElement | null
  const fullSrc = target?.dataset.fullSrc
  if (!fullSrc || warmed.has(fullSrc)) return
  warmed.add(fullSrc)
  new Image().src = fullSrc
}

export function ImageZoom() {
  const pathname = usePathname()
  const [zoomedImage, setZoomedImage] = useState<ZoomedImage | null>(null)
  const [mounted, setMounted] = useState(false)
  // Element focused before the overlay opened; focus returns to it on close
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    document.addEventListener('pointerover', warmFullSrc, { passive: true })
    document.addEventListener('touchstart', warmFullSrc, { passive: true })
    return () => {
      document.removeEventListener('pointerover', warmFullSrc)
      document.removeEventListener('touchstart', warmFullSrc)
    }
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach on route change
  useEffect(() => {
    setZoomedImage(null)

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest(
        '.prose img, [data-zoomable]'
      ) as HTMLImageElement | null
      if (!target) return

      e.preventDefault()
      triggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setZoomedImage({
        src: target.currentSrc || target.src,
        fullSrc: target.dataset.fullSrc ?? null,
        alt: target.alt ?? '',
      })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  if (!mounted || !zoomedImage) return null

  return createPortal(
    <ImageZoomOverlay
      image={zoomedImage}
      onClose={() => {
        setZoomedImage(null)
        triggerRef.current?.focus()
        triggerRef.current = null
      }}
    />,
    document.body
  ) as ReactNode
}
