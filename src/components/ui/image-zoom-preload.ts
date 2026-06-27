import type {
  ZoomedImage,
  ZoomGalleryItem,
} from '@/components/ui/image-zoom-overlay'

const preloadedImageUrls = new Set<string>()
const activeImagePreloads = new Map<string, HTMLImageElement>()

function preloadImageUrl(src: string | null | undefined) {
  const url = src?.trim()
  if (
    !url ||
    typeof window === 'undefined' ||
    preloadedImageUrls.has(url) ||
    activeImagePreloads.has(url)
  ) {
    return
  }

  const image = new window.Image()
  const cleanup = () => activeImagePreloads.delete(url)
  const finish = () => {
    if (typeof image.decode === 'function') {
      void image
        .decode()
        .catch(() => {})
        .finally(cleanup)
      return
    }
    cleanup()
  }

  image.decoding = 'async'
  image.onload = finish
  image.onerror = () => {
    preloadedImageUrls.delete(url)
    cleanup()
  }

  preloadedImageUrls.add(url)
  activeImagePreloads.set(url, image)
  image.src = url

  if (image.complete && image.naturalWidth > 0) finish()
}

export function preloadZoomItemSources(
  item: Pick<ZoomGalleryItem, 'src' | 'fullSrc'> | null | undefined
) {
  if (!item) return
  preloadImageUrl(item.src)
  if (item.fullSrc !== item.src) preloadImageUrl(item.fullSrc)
}

export function preloadZoomGalleryNeighbors(
  gallery: ZoomedImage['gallery'] | null | undefined
) {
  if (!gallery) return

  preloadZoomItemSources(gallery.items[gallery.index - 1])
  preloadZoomItemSources(gallery.items[gallery.index + 1])
}
