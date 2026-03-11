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
    return () => {
      zoom.detach()
    }
  }, [pathname])

  return null
}
