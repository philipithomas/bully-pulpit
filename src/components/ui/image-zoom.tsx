'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ZoomedImage } from '@/components/ui/image-zoom-overlay'

// Keeps the overlay out of the shared first-load bundle;
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
      const matched = (e.target as HTMLElement).closest(
        '.prose img, [data-zoomable]'
      ) as HTMLElement | null
      if (!matched) return

      // The matched element is either the image itself (prose images, the
      // homepage portraits) or a wrapper control around one (the photography
      // tiles, where keyboard activation targets the button, not the img).
      const img =
        matched instanceof HTMLImageElement
          ? matched
          : matched.querySelector('img')
      if (!img) return

      e.preventDefault()
      triggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      // Data attributes may sit on the wrapper or on the img itself.
      const fullSrc = matched.dataset.fullSrc ?? img.dataset.fullSrc ?? null
      const href = matched.dataset.zoomLinkHref ?? img.dataset.zoomLinkHref
      const title = matched.dataset.zoomLinkTitle ?? img.dataset.zoomLinkTitle
      const rect = img.getBoundingClientRect()
      setZoomedImage({
        src: img.currentSrc || img.src,
        fullSrc,
        alt: img.alt ?? '',
        caption: href && title ? { href, title } : null,
        // Plain object copy: the overlay animates from and back to this box.
        rect:
          rect.width > 0 && rect.height > 0
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : null,
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
