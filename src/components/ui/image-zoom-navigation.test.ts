import { describe, expect, it } from 'vitest'
import {
  isPhotoCollection,
  type ViewerHistory,
  viewerHistoryAction,
  zoomGalleryIndex,
} from '@/components/ui/image-zoom-navigation'
import type {
  ZoomedImage,
  ZoomGalleryItem,
} from '@/components/ui/image-zoom-overlay'

function image(
  index: number,
  collection?: 'tidbits' | 'tsundoku',
  total = 3
): ZoomedImage {
  const items: ZoomGalleryItem[] = Array.from(
    { length: total },
    (_, position) => ({
      src: `/images/${position}.jpg`,
      originalSrc: null,
      fullSrc: null,
      alt: `Photo ${position}`,
      width: 1200,
      height: 800,
      caption: {
        title: `Photo ${position}`,
        href: `/photo-${position}`,
        collection,
        presentation: collection === 'tsundoku' ? 'rail' : 'immersive',
      },
    })
  )
  return {
    src: '/images/current.jpg',
    originalSrc: null,
    fullSrc: null,
    alt: 'Current photo',
    width: 1200,
    height: 800,
    rect: null,
    caption: items[index]?.caption,
    gallery: { items, index },
  }
}

describe('photo viewer navigation', () => {
  it.each([
    'tidbits',
    'tsundoku',
  ] as const)('wraps both ends of %s', (collection) => {
    expect(zoomGalleryIndex(image(0, collection), -1)).toBe(2)
    expect(zoomGalleryIndex(image(2, collection), 1)).toBe(0)
    expect(zoomGalleryIndex(image(1, collection), 1)).toBe(2)
    expect(zoomGalleryIndex(image(1, collection), -1)).toBe(0)
  })

  it('keeps an ordinary image group bounded even with an immersive presentation', () => {
    expect(zoomGalleryIndex(image(0), -1)).toBeNull()
    expect(zoomGalleryIndex(image(2), 1)).toBeNull()
    expect(zoomGalleryIndex(image(0), 1)).toBe(1)
    expect(zoomGalleryIndex(image(2), -1)).toBe(1)
  })

  it('allows both directions through a two-photo collection', () => {
    expect(zoomGalleryIndex(image(0, 'tidbits', 2), -1)).toBe(1)
    expect(zoomGalleryIndex(image(0, 'tidbits', 2), 1)).toBe(1)
  })

  it('does not navigate empty, single-image, or not-yet-loaded galleries', () => {
    for (const total of [0, 1]) {
      expect(zoomGalleryIndex(image(0, 'tidbits', total), -1)).toBeNull()
      expect(zoomGalleryIndex(image(0, 'tidbits', total), 1)).toBeNull()
    }
    const pending = image(0, 'tidbits')
    pending.gallery = undefined
    pending.photoNeighbors = { newer: null, older: null, index: 0, total: 3 }
    expect(zoomGalleryIndex(pending, 1)).toBeNull()
  })

  it('opts only the exact photo collection names into circular behavior', () => {
    expect(isPhotoCollection('tidbits')).toBe(true)
    expect(isPhotoCollection('tsundoku')).toBe(true)
    for (const value of [
      'postcard',
      'workshop',
      'contraption',
      'sundoku',
      '',
      null,
      undefined,
    ]) {
      expect(isPhotoCollection(value)).toBe(false)
    }
  })
})

describe('photo viewer history', () => {
  const sourceUrl = 'https://www.philipithomas.com/cycling'
  const copenhill = 'https://www.philipithomas.com/copenhill'

  it('leaves a directly opened post untouched until the first photo change', () => {
    const history: ViewerHistory = {
      sourceUrl,
      targetUrl: sourceUrl,
      hasEntry: false,
    }
    expect(viewerHistoryAction(history, sourceUrl)).toBe('none')
    expect(viewerHistoryAction(history, copenhill)).toBe('push')
  })

  it('keeps one viewer entry through a complete circular return to the source URL', () => {
    const history: ViewerHistory = {
      sourceUrl,
      targetUrl: copenhill,
      hasEntry: true,
    }
    expect(
      viewerHistoryAction(history, 'https://www.philipithomas.com/sfmoma')
    ).toBe('replace')
    expect(viewerHistoryAction(history, sourceUrl)).toBe('replace')
    expect(
      viewerHistoryAction({ ...history, targetUrl: sourceUrl }, copenhill)
    ).toBe('replace')
  })

  it('replaces the gallery-created or Forward-restored entry after hydration', () => {
    const history: ViewerHistory = {
      sourceUrl: 'https://www.philipithomas.com/tidbits',
      targetUrl: sourceUrl,
      hasEntry: true,
    }
    expect(viewerHistoryAction(history, sourceUrl)).toBe('replace')
    expect(viewerHistoryAction(history, copenhill)).toBe('replace')
  })
})
