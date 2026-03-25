'use client'

import mediumZoom from 'medium-zoom'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

export function ImageZoom() {
  const pathname = usePathname()

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach zoom on route change
  useEffect(() => {
    const zoom = mediumZoom('.prose img, [data-zoomable]', {
      background: '#0A0A0A',
      margin: 24,
    })

    // After zoom animation completes, swap in the full-res image
    // without blocking the initial zoom. We use data-full-src instead
    // of data-zoom-src so medium-zoom doesn't block the animation
    // waiting for a multi-MB download.
    zoom.on('opened', () => {
      const original = zoom.getZoomedImage() as HTMLImageElement | null
      const fullSrc = original?.dataset.fullSrc
      if (!fullSrc) return

      const hd = new Image()
      hd.onload = () => {
        const zoomed = document.querySelector(
          '.medium-zoom-image--opened'
        ) as HTMLImageElement | null
        if (!zoomed) return
        zoomed.src = fullSrc
        zoomed.removeAttribute('srcset')
        zoomed.removeAttribute('sizes')
        zoomed.removeAttribute('width')
        zoomed.removeAttribute('height')
        zoomed.style.width = 'auto'
        zoomed.style.height = 'auto'
      }
      hd.src = fullSrc
    })

    return () => {
      zoom.detach()
    }
  }, [pathname])

  return null
}
