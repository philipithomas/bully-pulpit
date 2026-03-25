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

    // When zooming with data-zoom-src, the HD image may have different
    // dimensions than the thumbnail. Remove explicit width/height so the
    // zoomed image renders at its natural aspect ratio.
    zoom.on('open', () => {
      const zoomed = document.querySelector(
        '.medium-zoom-image--opened'
      ) as HTMLImageElement | null
      if (zoomed?.dataset.zoomSrc) {
        zoomed.removeAttribute('width')
        zoomed.removeAttribute('height')
        zoomed.style.width = 'auto'
        zoomed.style.height = 'auto'
      }
    })

    return () => {
      zoom.detach()
    }
  }, [pathname])

  return null
}
