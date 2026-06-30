'use client'

import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  ZoomCaptionLink,
  ZoomedImage,
  ZoomGalleryItem,
} from '@/components/ui/image-zoom-overlay'
import { preloadZoomItemSources } from '@/components/ui/image-zoom-preload'
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

interface ViewerHistory {
  sourceUrl: string
  targetUrl: string
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

function zoomItemFromElement(element: HTMLElement): ZoomGalleryItem | null {
  const img =
    element instanceof HTMLImageElement ? element : element.querySelector('img')
  if (!img) return null
  const fullSrc = element.dataset.fullSrc ?? img.dataset.fullSrc ?? null
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
    img.dataset.zoomCaptionLocationName
  const locationUrl =
    element.dataset.zoomCaptionLocationUrl ?? img.dataset.zoomCaptionLocationUrl
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
    fullSrc: fullSources?.src ?? fullSrc,
    fullSrcSet: fullSources?.srcSet ?? null,
    fullSizes: fullSources?.sizes ?? null,
    alt: img.alt ?? '',
    width,
    height,
    caption:
      title || href || footerLinks.length > 0
        ? {
            href: href ?? null,
            title: title ?? img.alt ?? '',
            description,
            date,
            locationName,
            locationUrl,
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

  const clearZoom = useCallback(() => {
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
    if (sourceUrl === targetUrl) return

    viewerHistoryRef.current = { sourceUrl, targetUrl }
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
    if (history.targetUrl === targetUrl) return

    viewerHistoryRef.current = { ...history, targetUrl }
    window.history.replaceState(
      imageZoomHistoryState(image, history.sourceUrl),
      '',
      targetPath
    )
  }, [])

  const openZoom = useCallback(
    (image: ZoomedImage) => {
      zoomedImageRef.current = image
      pushViewerUrl(image)
      setZoomedImage(image)
    },
    [pushViewerUrl]
  )

  const handleNavigate = useCallback(
    (direction: -1 | 1) => {
      const gallery = zoomedImageRef.current?.gallery
      if (!gallery) return
      const index = gallery.index + direction
      if (index < 0 || index >= gallery.items.length) return

      const nextImage: ZoomedImage = {
        ...gallery.items[index],
        rect: null,
        gallery: { ...gallery, index },
      }
      zoomedImageRef.current = nextImage
      replaceViewerUrl(nextImage)
      setZoomedImage(nextImage)
    },
    [replaceViewerUrl]
  )

  const handleClose = useCallback(() => {
    const history = viewerHistoryRef.current
    if (history && window.location.href !== history.sourceUrl) {
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
        }
        setZoomedImage(image)
        return
      }

      if (viewerHistoryRef.current || zoomedImageRef.current) {
        clearZoom()
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [clearZoom])

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

      // The matched element is either the image itself (prose images, the
      // homepage portraits) or a wrapper control around one (the photography
      // tiles, where keyboard activation targets the button, not the img).
      const img =
        matched instanceof HTMLImageElement
          ? matched
          : matched.querySelector('img')
      if (!img) return

      e.preventDefault()
      triggerRef.current =
        document.activeElement instanceof HTMLElement
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
      const rect = img.getBoundingClientRect()
      openZoom({
        ...item,
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
      onClose={handleClose}
    />,
    document.body
  ) as ReactNode
}
