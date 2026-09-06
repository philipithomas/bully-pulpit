import type { ZoomGalleryItem } from '@/components/ui/image-zoom-overlay'

export type PhotoCollection = 'tidbits' | 'tsundoku'

interface CollectionCacheEntry {
  request: Promise<ZoomGalleryItem[]>
  photos?: ZoomGalleryItem[]
}

const collections = new Map<PhotoCollection, CollectionCacheEntry>()
const staleCollections = new Set<PhotoCollection>()

/** Fetch once per collection after interaction; a failed request can be retried. */
export function loadPhotoGallery(collection: PhotoCollection) {
  const cached = collections.get(collection)
  if (cached) return cached.request
  const entry: CollectionCacheEntry = {
    request: fetch(`/api/posts?newsletter=${collection}&view=gallery`, {
      signal: AbortSignal.timeout(10000),
      // A newly published post can arrive before the cached album catches up.
      // Its next explicit retry must not reuse the browser's stale response.
      ...(staleCollections.has(collection) ? { cache: 'reload' as const } : {}),
    })
      .then(async (response): Promise<ZoomGalleryItem[]> => {
        if (!response.ok) throw new Error('Photo collection unavailable')
        const data = await response.json()
        if (
          !Array.isArray(data.photos) ||
          data.photos.some(
            (item: ZoomGalleryItem) =>
              !item ||
              typeof item.src !== 'string' ||
              !item.caption?.href?.startsWith('/') ||
              item.caption.collection !== collection
          )
        ) {
          throw new Error('Invalid photo collection')
        }
        entry.photos = data.photos
        return data.photos
      })
      .catch((error: unknown) => {
        if (collections.get(collection) === entry)
          collections.delete(collection)
        throw error
      }),
  }
  collections.set(collection, entry)
  return entry.request
}

/** Evict an album missing the active photo; the next user action retries once. */
export function photoGalleryIndex(
  collection: PhotoCollection,
  photos: ZoomGalleryItem[],
  href: string | null | undefined
): number {
  const index = photos.findIndex((item) => item.caption?.href === href)
  // An older completion must never discard a newer request already in flight.
  if (collections.get(collection)?.photos === photos) {
    if (index < 0) {
      collections.delete(collection)
      staleCollections.add(collection)
    } else {
      staleCollections.delete(collection)
    }
  }
  return index
}
