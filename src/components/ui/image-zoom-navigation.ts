import type { ZoomedImage } from '@/components/ui/image-zoom-overlay'

export function isPhotoCollection(
  value: unknown
): value is 'tidbits' | 'tsundoku' {
  return value === 'tidbits' || value === 'tsundoku'
}

/** Only the two photo collections loop; ordinary image groups keep their bounds. */
export function zoomGalleryIndex(image: ZoomedImage, direction: -1 | 1) {
  const gallery = image.gallery
  if (!gallery || gallery.items.length < 2) return null
  const index = gallery.index + direction
  if (isPhotoCollection(image.caption?.collection)) {
    return (index + gallery.items.length) % gallery.items.length
  }
  return index >= 0 && index < gallery.items.length ? index : null
}

export interface ViewerHistory {
  sourceUrl: string
  targetUrl: string
  hasEntry: boolean
}

/** Direct post opens defer their history entry until the first photo change. */
export function viewerHistoryAction(history: ViewerHistory, targetUrl: string) {
  if (!history.hasEntry) {
    return targetUrl === history.sourceUrl ? 'none' : 'push'
  }
  return 'replace'
}
