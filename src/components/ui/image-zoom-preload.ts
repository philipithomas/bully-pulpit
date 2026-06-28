import type {
  ZoomedImage,
  ZoomGalleryItem,
} from '@/components/ui/image-zoom-overlay'

const preloadedImageUrls = new Set<string>()
const activeImagePreloads = new Map<string, HTMLImageElement>()

function preloadImageUrl({
  src,
  srcSet,
  sizes,
}: {
  src: string | null | undefined
  srcSet?: string | null
  sizes?: string | null
}) {
  const url = src?.trim()
  const preloadKey = [url, srcSet?.trim() ?? '', sizes?.trim() ?? ''].join('\n')
  if (
    !url ||
    typeof window === 'undefined' ||
    preloadedImageUrls.has(preloadKey) ||
    activeImagePreloads.has(preloadKey)
  ) {
    return
  }

  const image = new window.Image()
  const cleanup = () => activeImagePreloads.delete(preloadKey)
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
  if (sizes) image.sizes = sizes
  if (srcSet) image.srcset = srcSet
  image.onload = finish
  image.onerror = () => {
    preloadedImageUrls.delete(preloadKey)
    cleanup()
  }

  preloadedImageUrls.add(preloadKey)
  activeImagePreloads.set(preloadKey, image)
  image.src = url

  if (image.complete && image.naturalWidth > 0) finish()
}

export function preloadZoomItemSources(
  item:
    | Pick<ZoomGalleryItem, 'src' | 'fullSrc' | 'fullSrcSet' | 'fullSizes'>
    | null
    | undefined
) {
  if (!item) return
  preloadImageUrl({ src: item.src })
  if (item.fullSrc !== item.src || item.fullSrcSet) {
    preloadImageUrl({
      src: item.fullSrc,
      srcSet: item.fullSrcSet,
      sizes: item.fullSizes,
    })
  }
}

export function preloadZoomGalleryNeighbors(
  gallery: ZoomedImage['gallery'] | null | undefined
) {
  if (!gallery) return

  preloadZoomItemSources(gallery.items[gallery.index - 1])
  preloadZoomItemSources(gallery.items[gallery.index + 1])
  preloadZoomItemSources(gallery.items[gallery.index + 2])
}
