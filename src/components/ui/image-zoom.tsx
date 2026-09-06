'use client'

import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  isPhotoCollection,
  type ViewerHistory,
  viewerHistoryAction,
  zoomGalleryIndex,
} from '@/components/ui/image-zoom-navigation'
import type {
  ZoomCaptionLink,
  ZoomedImage,
  ZoomGalleryItem,
} from '@/components/ui/image-zoom-overlay'
import { preloadZoomItemSources } from '@/components/ui/image-zoom-preload'
import type { PhotoMetadata } from '@/lib/content/types'
import { zoomImageSources } from '@/lib/content/zoom-image'

// Keeps the overlay out of the shared first-load bundle;
// the chunk loads only when an image is actually zoomed.
const ImageZoomOverlay = dynamic(
  () =>
    import('@/components/ui/image-zoom-overlay').then(
      (m) => m.ImageZoomOverlay
    ),
  { ssr: false }
)

const IMAGE_ZOOM_HISTORY_KEY = '__bpImageZoom'

interface ImageZoomHistoryValue {
  sourceUrl: string
  image: ZoomedImage
}

function imageWithoutAnimationRect(image: ZoomedImage): ZoomedImage {
  return {
    ...image,
    rect: null,
    gallery: image.gallery
      ? {
          index: image.gallery.index,
          items: image.gallery.items,
        }
      : undefined,
  }
}

function imageZoomHistoryValue(state: unknown): ImageZoomHistoryValue | null {
  if (!state || typeof state !== 'object') return null
  const value = (state as Record<string, unknown>)[IMAGE_ZOOM_HISTORY_KEY]
  if (!value || typeof value !== 'object') return null

  const sourceUrl = (value as Record<string, unknown>).sourceUrl
  const image = (value as Record<string, unknown>).image
  if (typeof sourceUrl !== 'string') return null
  if (!image || typeof image !== 'object') return null

  return { sourceUrl, image: image as ZoomedImage }
}

function imageZoomHistoryState(image: ZoomedImage, sourceUrl: string) {
  return {
    [IMAGE_ZOOM_HISTORY_KEY]: {
      sourceUrl,
      image: imageWithoutAnimationRect(image),
    },
  }
}

function internalPathForHref(href: string | null | undefined): string | null {
  if (!href) return null
  const target = new URL(href, window.location.href)
  if (target.origin !== window.location.origin) return null
  return `${target.pathname}${target.search}${target.hash}`
}

function fullUrlForPath(path: string): string {
  return new URL(path, window.location.href).href
}

function zoomCaptionLinksFromDataset(value: string | undefined) {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((item): ZoomCaptionLink[] => {
      if (!item || typeof item !== 'object') return []
      const href = (item as Record<string, unknown>).href
      const title = (item as Record<string, unknown>).title
      const meta = (item as Record<string, unknown>).meta
      if (typeof href !== 'string' || typeof title !== 'string') return []

      return [
        {
          href,
          title,
          meta: typeof meta === 'string' ? meta : null,
        },
      ]
    })
  } catch {
    return []
  }
}

function positiveIntegerFromDataset(value: string | undefined): number | null {
  if (!value || !/^[0-9]+$/.test(value)) return null
  const parsed = Number(value)
  return parsed > 0 ? parsed : null
}

const PHOTO_METADATA_STRING_KEYS = [
  'camera',
  'lens',
  'focalLength',
  'aperture',
  'exposureTime',
] as const
const PHOTO_METADATA_KEYS = new Set([
  ...PHOTO_METADATA_STRING_KEYS,
  'apertureEstimated',
  'iso',
])

function photoMetadataFromDataset(
  value: string | undefined
): PhotoMetadata | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const record = parsed as Record<string, unknown>
    if (Object.keys(record).some((key) => !PHOTO_METADATA_KEYS.has(key))) {
      return null
    }
    for (const key of PHOTO_METADATA_STRING_KEYS) {
      const field = record[key]
      if (
        field !== undefined &&
        (typeof field !== 'string' || field.trim() === '')
      ) {
        return null
      }
    }
    if (
      record.iso !== undefined &&
      (typeof record.iso !== 'number' ||
        !Number.isInteger(record.iso) ||
        record.iso <= 0)
    ) {
      return null
    }
    if (
      record.apertureEstimated !== undefined &&
      typeof record.apertureEstimated !== 'boolean'
    ) {
      return null
    }
    if (record.apertureEstimated === true && !record.aperture) return null

    const hasDisplayValue =
      PHOTO_METADATA_STRING_KEYS.some((key) => Boolean(record[key])) ||
      typeof record.iso === 'number'
    return hasDisplayValue ? (record as PhotoMetadata) : null
  } catch {
    return null
  }
}

function zoomItemFromElement(element: HTMLElement): ZoomGalleryItem | null {
  const img =
    element instanceof HTMLImageElement ? element : element.querySelector('img')
  if (!img) return null
  const fullSrc = element.dataset.fullSrc ?? img.dataset.fullSrc ?? null
  const srcAttr = img.getAttribute('src')
  const originalSrc =
    fullSrc ?? (srcAttr && !srcAttr.startsWith('/_next/image') ? srcAttr : null)
  const fullWidth = positiveIntegerFromDataset(
    element.dataset.fullWidth ?? img.dataset.fullWidth
  )
  const fullHeight = positiveIntegerFromDataset(
    element.dataset.fullHeight ?? img.dataset.fullHeight
  )
  const fullSizes = element.dataset.fullSizes ?? img.dataset.fullSizes
  const fullSources = zoomImageSources({
    src: fullSrc,
    dimensions:
      fullWidth && fullHeight ? { width: fullWidth, height: fullHeight } : null,
    sizes: fullSizes,
  })
  const href = element.dataset.zoomCaptionHref ?? img.dataset.zoomCaptionHref
  const title = element.dataset.zoomCaptionTitle ?? img.dataset.zoomCaptionTitle
  const description =
    element.dataset.zoomCaptionDescription ??
    img.dataset.zoomCaptionDescription ??
    null
  const date = element.dataset.zoomCaptionDate ?? img.dataset.zoomCaptionDate
  const locationName =
    element.dataset.zoomCaptionLocationName ??
    img.dataset.zoomCaptionLocationName ??
    element.dataset.zoomCaptionLocation ??
    img.dataset.zoomCaptionLocation
  const locationUrl =
    element.dataset.zoomCaptionLocationUrl ??
    img.dataset.zoomCaptionLocationUrl ??
    element.dataset.zoomCaptionLocationHref ??
    img.dataset.zoomCaptionLocationHref
  const photo = photoMetadataFromDataset(
    element.dataset.zoomCaptionPhoto ?? img.dataset.zoomCaptionPhoto
  )
  const presentationValue =
    element.dataset.zoomCaptionPresentation ??
    img.dataset.zoomCaptionPresentation
  const presentation =
    presentationValue === 'immersive' || presentationValue === 'rail'
      ? presentationValue
      : undefined
  const collectionValue =
    element.dataset.zoomCaptionCollection ?? img.dataset.zoomCaptionCollection
  const collection =
    collectionValue === 'tidbits' || collectionValue === 'tsundoku'
      ? collectionValue
      : undefined
  const footerHeading =
    element.dataset.zoomCaptionFooterHeading ??
    img.dataset.zoomCaptionFooterHeading
  const footerLinks = zoomCaptionLinksFromDataset(
    element.dataset.zoomCaptionLinks ?? img.dataset.zoomCaptionLinks
  )
  const rect = img.getBoundingClientRect()
  const width =
    fullWidth ??
    (img.naturalWidth > 0
      ? img.naturalWidth
      : rect.width > 0
        ? rect.width
        : null)
  const height =
    fullHeight ??
    (img.naturalHeight > 0
      ? img.naturalHeight
      : rect.height > 0
        ? rect.height
        : null)
  return {
    src: img.currentSrc || img.src,
    originalSrc,
    fullSrc: fullSources?.src ?? fullSrc,
    fullSrcSet: fullSources?.srcSet ?? null,
    fullSizes: fullSources?.sizes ?? null,
    alt: img.alt ?? '',
    width,
    height,
    caption:
      title || href || photo || footerLinks.length > 0
        ? {
            href: href ?? null,
            title: title ?? img.alt ?? '',
            description,
            date,
            locationName,
            locationUrl,
            photo,
            presentation,
            collection,
            footer:
              footerLinks.length > 0
                ? {
                    heading: footerHeading ?? 'Featured on',
                    links: footerLinks,
                  }
                : null,
          }
        : null,
  }
}

function warmZoomTargetSources(e: Event) {
  const target = e.target
  if (!(target instanceof Element)) return

  const matched = target.closest(
    '.prose img, [data-zoomable], [data-full-src]'
  ) as HTMLElement | null
  preloadZoomItemSources(matched ? zoomItemFromElement(matched) : null)
}

export function ImageZoom() {
  const pathname = usePathname()
  const router = useRouter()
  const [zoomedImage, setZoomedImage] = useState<ZoomedImage | null>(null)
  const [mounted, setMounted] = useState(false)
  // Element focused before the overlay opened; focus returns to it on close
  const triggerRef = useRef<HTMLElement | null>(null)
  const zoomedImageRef = useRef<ZoomedImage | null>(null)
  const viewerHistoryRef = useRef<ViewerHistory | null>(null)
  const pathnameRef = useRef(pathname)
  const openingRef = useRef(0)
  const navigatingRef = useRef(false)
  const [navigationError, setNavigationError] = useState<string | undefined>()

  const clearZoom = useCallback(() => {
    openingRef.current++
    navigatingRef.current = false
    setNavigationError(undefined)
    zoomedImageRef.current = null
    viewerHistoryRef.current = null
    setZoomedImage(null)
    triggerRef.current?.focus()
    triggerRef.current = null
  }, [])

  const pushViewerUrl = useCallback((image: ZoomedImage) => {
    const targetPath = internalPathForHref(image.caption?.href)
    if (!targetPath) return

    const sourceUrl = window.location.href
    const targetUrl = fullUrlForPath(targetPath)
    const source = new URL(sourceUrl)
    const samePost = `${source.pathname}${source.search}` === targetPath
    viewerHistoryRef.current = {
      sourceUrl,
      targetUrl: samePost ? sourceUrl : targetUrl,
      hasEntry: !samePost,
    }
    if (samePost) return
    window.history.pushState(
      imageZoomHistoryState(image, sourceUrl),
      '',
      targetPath
    )
  }, [])

  const replaceViewerUrl = useCallback((image: ZoomedImage) => {
    const history = viewerHistoryRef.current
    const targetPath = internalPathForHref(image.caption?.href)
    if (!history || !targetPath) return

    const targetUrl = fullUrlForPath(targetPath)
    const action = viewerHistoryAction(history, targetUrl)
    if (action === 'none') return
    viewerHistoryRef.current = { ...history, targetUrl, hasEntry: true }
    window.history[action === 'push' ? 'pushState' : 'replaceState'](
      imageZoomHistoryState(image, history.sourceUrl),
      '',
      targetPath
    )
  }, [])

  const hydratePhotoGallery = useCallback(async () => {
    const current = zoomedImageRef.current
    const collection = current?.caption?.collection
    if (!current || current.gallery || !isPhotoCollection(collection)) return
    const opening = openingRef.current
    const { loadPhotoGallery, photoGalleryIndex } = await import(
      '@/components/ui/photo-gallery-loader'
    )
    const items = await loadPhotoGallery(collection)
    const active = zoomedImageRef.current
    if (
      opening !== openingRef.current ||
      !active ||
      active.caption?.collection !== collection
    )
      return
    const index = photoGalleryIndex(collection, items, active.caption?.href)
    if (index < 0) throw new Error('Photo not in collection')
    const hydrated = {
      ...active,
      photoNeighbors: undefined,
      gallery: { items, index },
    }
    zoomedImageRef.current = hydrated
    setZoomedImage(hydrated)
    if (viewerHistoryRef.current?.hasEntry) replaceViewerUrl(hydrated)
    setNavigationError(undefined)
  }, [replaceViewerUrl])

  const openZoom = useCallback(
    (image: ZoomedImage) => {
      openingRef.current++
      navigatingRef.current = false
      setNavigationError(undefined)
      zoomedImageRef.current = image
      pushViewerUrl(image)
      setZoomedImage(image)
      if (!image.gallery && isPhotoCollection(image.caption?.collection)) {
        const opening = openingRef.current
        preloadZoomItemSources(image.photoNeighbors?.newer)
        preloadZoomItemSources(image.photoNeighbors?.older)
        void hydratePhotoGallery().catch(() => {
          if (opening === openingRef.current)
            setNavigationError('Could not load more photos. Try again.')
        })
      }
    },
    [hydratePhotoGallery, pushViewerUrl]
  )

  const handleNavigate = useCallback(
    async (direction: -1 | 1) => {
      if (navigatingRef.current) return
      let current = zoomedImageRef.current
      if (!current) return
      const opening = openingRef.current
      setNavigationError(undefined)
      const neighbor =
        direction === 1
          ? current.photoNeighbors?.older
          : current.photoNeighbors?.newer
      if (!current.gallery && !neighbor) {
        navigatingRef.current = true
        try {
          await hydratePhotoGallery()
        } catch {
          if (opening === openingRef.current)
            setNavigationError('Could not load more photos. Try again.')
          return
        } finally {
          if (opening === openingRef.current) navigatingRef.current = false
        }
        if (opening !== openingRef.current) return
        current = zoomedImageRef.current
        if (!current) return
      }
      const index = zoomGalleryIndex(current, direction)
      let nextImage: ZoomedImage
      if (current.gallery && index !== null) {
        nextImage = {
          ...current.gallery.items[index],
          rect: null,
          gallery: { ...current.gallery, index },
        }
      } else if (neighbor && current.photoNeighbors) {
        const { total, index: previousIndex } = current.photoNeighbors
        const {
          rect: _rect,
          gallery: _gallery,
          photoNeighbors: _neighbors,
          ...currentItem
        } = current
        nextImage = {
          ...neighbor,
          rect: null,
          photoNeighbors: {
            total,
            index: (previousIndex + direction + total) % total,
            older: total === 2 || direction === -1 ? currentItem : null,
            newer: total === 2 || direction === 1 ? currentItem : null,
          },
        }
      } else return
      zoomedImageRef.current = nextImage
      replaceViewerUrl(nextImage)
      setZoomedImage(nextImage)
      if (!nextImage.gallery) {
        void hydratePhotoGallery().catch(() => {
          if (opening === openingRef.current)
            setNavigationError('Could not load more photos. Try again.')
        })
      }
    },
    [hydratePhotoGallery, replaceViewerUrl]
  )

  const handleClose = useCallback(() => {
    const history = viewerHistoryRef.current
    if (history?.hasEntry) {
      window.history.back()
      window.setTimeout(() => {
        if (
          viewerHistoryRef.current === history &&
          window.location.href === history.sourceUrl
        ) {
          clearZoom()
        }
      }, 120)
      return
    }

    clearZoom()
  }, [clearZoom])

  const handleNavigateTo = useCallback(
    (href: string) => {
      clearZoom()
      router.replace(href)
    },
    [clearZoom, router]
  )

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    document.addEventListener('pointerover', warmZoomTargetSources, {
      passive: true,
    })
    document.addEventListener('touchstart', warmZoomTargetSources, {
      passive: true,
    })
    return () => {
      document.removeEventListener('pointerover', warmZoomTargetSources)
      document.removeEventListener('touchstart', warmZoomTargetSources)
    }
  }, [])

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const value = imageZoomHistoryValue(event.state)
      if (value) {
        const image = imageWithoutAnimationRect(value.image)
        zoomedImageRef.current = image
        viewerHistoryRef.current = {
          sourceUrl: value.sourceUrl,
          targetUrl: window.location.href,
          hasEntry: true,
        }
        openingRef.current++
        navigatingRef.current = false
        setNavigationError(undefined)
        setZoomedImage(image)
        if (!image.gallery && isPhotoCollection(image.caption?.collection)) {
          void hydratePhotoGallery().catch(() => {})
        }
        return
      }

      if (viewerHistoryRef.current || zoomedImageRef.current) {
        clearZoom()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [clearZoom, hydratePhotoGallery])

  useEffect(() => {
    if (pathnameRef.current === pathname) return
    pathnameRef.current = pathname
    if (imageZoomHistoryValue(window.history.state)) return
    if (viewerHistoryRef.current || zoomedImageRef.current) clearZoom()
  }, [pathname, clearZoom])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const matched = (e.target as HTMLElement).closest(
        '.prose img, [data-zoomable]'
      ) as HTMLElement | null
      if (!matched) return
      if (
        matched instanceof HTMLAnchorElement &&
        (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      ) {
        return
      }

      // The matched element is either the image itself (prose images, the
      // homepage portraits) or a wrapper link/control around one (the photo
      // tiles, where keyboard activation targets the wrapper, not the img).
      const img =
        matched instanceof HTMLImageElement
          ? matched
          : matched.querySelector('img')
      if (!img) return

      e.preventDefault()
      triggerRef.current =
        matched.tabIndex >= 0
          ? matched
          : document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null
      const item = zoomItemFromElement(matched)
      if (!item) return

      const group = matched.dataset.zoomGroup
      const groupElements = group
        ? Array.from(
            document.querySelectorAll<HTMLElement>('[data-zoom-group]')
          )
            .filter((el) => el.dataset.zoomGroup === group)
            .filter((el) => zoomItemFromElement(el) !== null)
        : []
      const groupItems = groupElements
        .map(zoomItemFromElement)
        .filter((i): i is ZoomGalleryItem => i !== null)
      const groupIndex = groupElements.indexOf(matched)
      let photoNeighbors: ZoomedImage['photoNeighbors']
      if (
        isPhotoCollection(item.caption?.collection) &&
        matched.dataset.zoomPhotoNeighbors
      ) {
        try {
          const neighbors: ZoomGalleryItem[] = JSON.parse(
            matched.dataset.zoomPhotoNeighbors
          )
          const total = positiveIntegerFromDataset(
            matched.dataset.zoomPhotoCount
          )
          const index = Number(matched.dataset.zoomPhotoIndex)
          if (
            total &&
            total > 1 &&
            Number.isInteger(index) &&
            index >= 0 &&
            index < total &&
            Array.isArray(neighbors) &&
            neighbors.length > 0 &&
            neighbors.length <= 2 &&
            neighbors.every(
              (neighbor) =>
                neighbor?.caption?.collection === item.caption?.collection &&
                typeof neighbor.src === 'string'
            )
          ) {
            photoNeighbors = {
              newer: neighbors[0],
              older: neighbors[1] ?? neighbors[0],
              total,
              index,
            }
          }
        } catch {
          /* Invalid neighbor data must not prevent opening the current photo. */
        }
      }
      const rect = img.getBoundingClientRect()
      openZoom({
        ...item,
        photoNeighbors,
        // Plain object copy: the overlay animates from and back to this box.
        rect:
          rect.width > 0 && rect.height > 0
            ? {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              }
            : null,
        ...(groupItems.length > 1 && groupIndex >= 0
          ? { gallery: { items: groupItems, index: groupIndex } }
          : {}),
      })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [openZoom])

  if (!mounted || !zoomedImage) return null

  return createPortal(
    <ImageZoomOverlay
      image={zoomedImage}
      onNavigate={handleNavigate}
      onNavigateTo={handleNavigateTo}
      navigationError={navigationError}
      onClose={handleClose}
    />,
    document.body
  ) as ReactNode
}
