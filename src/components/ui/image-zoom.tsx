'use client'

import mediumZoom from 'medium-zoom'
import { useEffect } from 'react'

export function ImageZoom() {
  useEffect(() => {
    const zoom = mediumZoom('.prose img, [data-zoomable]', {
      background: '#0A0A0A',
      margin: 0,
    })
    return () => {
      zoom.detach()
    }
  }, [])

  return null
}
