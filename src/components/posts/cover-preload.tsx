'use client'

import { useEffect } from 'react'

const warmed = new Set<string>()

function warm(target: EventTarget | null) {
  if (!(target instanceof Element)) return
  const link = target.closest('a[data-cover-srcset]')
  if (!link) return
  const srcset = link.getAttribute('data-cover-srcset')
  if (!srcset || warmed.has(srcset)) return
  warmed.add(srcset)
  // An off-DOM image fetches the right candidate into the browser cache
  // without the console noise of an unused <link rel="preload">.
  const img = new Image()
  img.sizes = link.getAttribute('data-cover-sizes') ?? ''
  img.srcset = srcset
}

/**
 * Warms the destination post's cover image when a post link is hovered,
 * touched, or focused, so the cover is already cached when the route loads.
 * One delegated listener; links opt in via data-cover-srcset (see
 * coverPreloadAttrs).
 */
export function CoverPreload() {
  useEffect(() => {
    const onPointerOver = (e: PointerEvent) => warm(e.target)
    const onTouchStart = (e: TouchEvent) => warm(e.target)
    const onFocusIn = (e: FocusEvent) => warm(e.target)
    document.addEventListener('pointerover', onPointerOver, { passive: true })
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [])
  return null
}
