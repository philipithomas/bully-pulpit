'use client'

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Info,
  PanelRightClose,
  X,
} from 'lucide-react'
import NextImage from 'next/image'
import Link from 'next/link'
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { preloadZoomGalleryNeighbors } from '@/components/ui/image-zoom-preload'

export interface ZoomCaption {
  href?: string | null
  title: string
  description?: string | null
  date?: string | null
  locationName?: string | null
  locationUrl?: string | null
  presentation?: 'rail' | 'immersive'
  collection?: 'tsundoku' | 'umami'
  footer?: ZoomCaptionFooter | null
}

export interface ZoomCaptionFooter {
  heading: string
  links: ZoomCaptionLink[]
}

export interface ZoomCaptionLink {
  href: string
  title: string
  meta?: string | null
}

export interface ZoomGalleryItem {
  src: string
  originalSrc: string | null
  fullSrc: string | null
  fullSrcSet?: string | null
  fullSizes?: string | null
  alt: string
  width: number | null
  height: number | null
  caption?: ZoomCaption | null
}

export interface ZoomedImage {
  src: string
  originalSrc: string | null
  fullSrc: string | null
  fullSrcSet?: string | null
  fullSizes?: string | null
  alt: string
  width: number | null
  height: number | null
  /** Optional post caption shown in the overlay; omitted for plain galleries. */
  caption?: ZoomCaption | null
  /** Viewport rect of the clicked image: where the zoom starts and ends. */
  rect: { top: number; left: number; width: number; height: number } | null
  gallery?: {
    items: ZoomGalleryItem[]
    index: number
  }
}

// Medium-style zoom: one click opens, one click anywhere (or Escape, or a
// scroll) closes. The image FLIP-animates between its on-page rect and the
// centered position; there is no panning or pinch zoom. Keep the duration in
// sync with the .image-zoom-opening and .image-zoom-closing classes in
// globals.css.
const ZOOM_MS = 280

// Duration of the full-resolution upgrade crossfade. Keep in sync with the
// .image-zoom-hd-in and .image-zoom-hd-out classes in globals.css.
const FADE_MS = 300

interface Upgrade {
  width: number
  height: number
  fading: boolean
  // Layout size of the outgoing image at upgrade time. The outgoing copy is
  // pinned at this exact size while it dissolves, so the upgrade never moves
  // pixels: same-frame upgrades read as the image sharpening in place, and
  // reframings (the mobile homepage crop zooming out to the full portrait)
  // dissolve without sliding.
  outgoingWidth: number
  outgoingHeight: number
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

type LayoutRect = Pick<DOMRect, 'top' | 'left' | 'width' | 'height'>

export function containedImageRect(
  bounds: LayoutRect,
  sourceWidth: number | null,
  sourceHeight: number | null
): LayoutRect {
  if (!sourceWidth || !sourceHeight) return bounds

  const scale = Math.min(
    bounds.width / sourceWidth,
    bounds.height / sourceHeight
  )
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  return {
    top: bounds.top + (bounds.height - height) / 2,
    left: bounds.left + (bounds.width - width) / 2,
    width,
    height,
  }
}

/** Transform that moves `node`'s visible contained image onto the source rect. */
function flipTransform(
  source: NonNullable<ZoomedImage['rect']>,
  layout: LayoutRect
): string {
  const scale = source.width / layout.width
  const dx = source.left + source.width / 2 - (layout.left + layout.width / 2)
  const dy = source.top + source.height / 2 - (layout.top + layout.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

function focusableOverlayItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []

  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex="0"]'
    )
  ).filter((el) => el.getClientRects().length > 0)
}

function containedLoadingDimensions(
  image: ZoomedImage,
  hasCaption: boolean,
  immersive: boolean,
  immersiveDetailsOpen: boolean
): { width: number; height: number } | null {
  const sourceWidth = image.width ?? image.rect?.width ?? null
  const sourceHeight = image.height ?? image.rect?.height ?? null
  if (!sourceWidth || !sourceHeight) return null

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const captionUsesSideRail =
    hasCaption && (viewportWidth >= 768 || viewportWidth > viewportHeight)
  // Keep this in sync with the captioned grid's clamp(14rem,32vw,26rem)
  // side-rail track below.
  const captionSideRailWidth = Math.min(
    Math.max(viewportWidth * 0.32, 14 * 16),
    26 * 16
  )
  const immersiveDetailsUseSideRail =
    immersiveDetailsOpen &&
    (viewportWidth >= 768 || viewportWidth > viewportHeight)
  const immersiveDetailsRailWidth = Math.min(
    viewportWidth * (viewportWidth >= 768 ? 0.34 : 0.42),
    24 * 16
  )
  const immersiveDetailsPanelHeight = Math.min(viewportHeight * 0.42, 20 * 16)
  const maxWidth = immersive
    ? immersiveDetailsUseSideRail
      ? Math.max(viewportWidth - immersiveDetailsRailWidth, 1)
      : viewportWidth
    : hasCaption
      ? captionUsesSideRail
        ? Math.max(viewportWidth - captionSideRailWidth, 1)
        : Math.max(viewportWidth - 16, 1)
      : viewportWidth * 0.9
  const maxHeight = immersive
    ? immersiveDetailsOpen && !immersiveDetailsUseSideRail
      ? Math.max(viewportHeight - immersiveDetailsPanelHeight, 1)
      : viewportHeight
    : hasCaption
      ? captionUsesSideRail
        ? viewportHeight
        : viewportHeight * (viewportWidth >= 640 ? 0.62 : 0.58)
      : viewportHeight * 0.9
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1)

  return {
    width: Math.round(sourceWidth * scale),
    height: Math.round(sourceHeight * scale),
  }
}

export function ImageZoomOverlay({
  image,
  onClose,
  onNavigate,
  onNavigateTo,
}: {
  image: ZoomedImage
  onClose: () => void
  onNavigate?: (direction: -1 | 1) => void
  onNavigateTo?: (href: string) => void
}) {
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening')
  const [hdSize, setHdSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null)
  const [immediateLoaded, setImmediateLoaded] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsId = useId()
  const statusId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const immediateRef = useRef<HTMLImageElement>(null)
  const detailsToggleRef = useRef<HTMLButtonElement>(null)
  const detailsCloseRef = useRef<HTMLButtonElement>(null)
  const closingRef = useRef(false)
  const swipeRef = useRef<{
    pointerId: number
    x: number
    y: number
  } | null>(null)
  const didSwipeRef = useRef(false)
  const swipeClickResetTimerRef = useRef<number | null>(null)
  const wheelDeltaRef = useRef(0)
  const wheelLockedUntilRef = useRef(0)
  const gallery = image.gallery ?? null
  const isImmersive = image.caption?.presentation === 'immersive'
  const hasGallery = Boolean(gallery && gallery.items.length > 1)
  const canPrevious = Boolean(gallery && gallery.index > 0)
  const canNext = Boolean(gallery && gallery.index < gallery.items.length - 1)

  useEffect(
    () => () => {
      if (swipeClickResetTimerRef.current !== null) {
        window.clearTimeout(swipeClickResetTimerRef.current)
      }
    },
    []
  )

  // Open: animate the image from its on-page rect to the centered layout
  // position. Reduced motion, a missing rect, or a not-yet-measurable layout
  // all degrade to the plain overlay fade.
  useEffect(() => {
    const node = containerRef.current
    const source = image.rect
    if (!node || !source || prefersReducedMotion()) {
      setPhase('open')
      return
    }
    const layout = containedImageRect(
      node.getBoundingClientRect(),
      image.width ?? immediateRef.current?.naturalWidth ?? null,
      image.height ?? immediateRef.current?.naturalHeight ?? null
    )
    if (layout.width === 0 || layout.height === 0) {
      setPhase('open')
      return
    }
    node.style.transition = 'none'
    node.style.transform = flipTransform(source, layout)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        node.style.transition = `transform ${ZOOM_MS}ms cubic-bezier(0.2, 0, 0.2, 1)`
        node.style.transform = ''
      })
    })
    const timer = setTimeout(() => setPhase('open'), ZOOM_MS)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(timer)
    }
  }, [image.height, image.rect, image.width])

  // Close: animate back to the on-page rect (scroll is locked, so the rect is
  // still where the image sits) while the overlay fades out.
  const handleClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    setPhase('closing')
    const node = containerRef.current
    if (node && image.rect && phase === 'open' && !prefersReducedMotion()) {
      node.style.transition = `transform ${ZOOM_MS}ms cubic-bezier(0.2, 0, 0.2, 1)`
      node.style.transform = flipTransform(
        image.rect,
        containedImageRect(
          node.getBoundingClientRect(),
          image.width ?? immediateRef.current?.naturalWidth ?? null,
          image.height ?? immediateRef.current?.naturalHeight ?? null
        )
      )
      setTimeout(onClose, ZOOM_MS)
    } else {
      setTimeout(onClose, prefersReducedMotion() ? 0 : ZOOM_MS)
    }
  }, [image.height, image.rect, image.width, onClose, phase])

  const closeDetails = useCallback(() => {
    setDetailsOpen(false)
    requestAnimationFrame(() => detailsToggleRef.current?.focus())
  }, [])

  // Escape dismisses the optional details layer before closing the viewer;
  // Tab is trapped among the visible overlay controls.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (isImmersive && detailsOpen) closeDetails()
        else handleClose()
        return
      }
      if (hasGallery && canPrevious && e.key === 'ArrowLeft') {
        e.preventDefault()
        onNavigate?.(-1)
      }
      if (hasGallery && canNext && e.key === 'ArrowRight') {
        e.preventDefault()
        onNavigate?.(1)
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const focusables = focusableOverlayItems(overlayRef.current)
        if (focusables.length === 0) {
          overlayRef.current?.focus()
          return
        }

        const currentIndex = focusables.indexOf(
          document.activeElement as HTMLElement
        )
        const nextIndex = e.shiftKey
          ? currentIndex <= 0
            ? focusables.length - 1
            : currentIndex - 1
          : currentIndex === -1 || currentIndex === focusables.length - 1
            ? 0
            : currentIndex + 1

        focusables[nextIndex]?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    canNext,
    canPrevious,
    closeDetails,
    detailsOpen,
    handleClose,
    hasGallery,
    isImmersive,
    onNavigate,
  ])

  // The compact viewer keeps the Medium-style scroll-to-close behavior. In
  // the immersive photo viewer, a wheel or trackpad gesture instead advances
  // the gallery so readers can move through photographs without hunting for
  // the controls.
  useEffect(() => {
    if (isImmersive) {
      const navigate = (e: WheelEvent) => {
        const target = e.target
        if (
          target instanceof Element &&
          target.closest('[data-zoom-caption-panel]')
        ) {
          return
        }

        e.preventDefault()
        const now = performance.now()
        if (now < wheelLockedUntilRef.current) return

        const dominantDelta =
          Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
        if (
          wheelDeltaRef.current !== 0 &&
          Math.sign(wheelDeltaRef.current) !== Math.sign(dominantDelta)
        ) {
          wheelDeltaRef.current = 0
        }
        wheelDeltaRef.current += dominantDelta
        if (Math.abs(wheelDeltaRef.current) < 48) return

        const direction = wheelDeltaRef.current > 0 ? 1 : -1
        wheelDeltaRef.current = 0
        wheelLockedUntilRef.current = now + 420
        if (direction === -1 && canPrevious) onNavigate?.(-1)
        if (direction === 1 && canNext) onNavigate?.(1)
      }

      window.addEventListener('wheel', navigate, { passive: false })
      return () => window.removeEventListener('wheel', navigate)
    }

    const close = (e: Event) => {
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('[data-zoom-caption-panel]')
      ) {
        return
      }
      handleClose()
    }
    window.addEventListener('wheel', close, { passive: true })
    window.addEventListener('touchmove', close, { passive: true })
    return () => {
      window.removeEventListener('wheel', close)
      window.removeEventListener('touchmove', close)
    }
  }, [canNext, canPrevious, handleClose, isImmersive, onNavigate])

  // Move focus into the overlay on mount; the opener restores it on close
  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  // The details trigger leaves the DOM while the panel is open. Move focus to
  // its matching collapse control, then restore it when the panel closes.
  useEffect(() => {
    if (!detailsOpen) return
    requestAnimationFrame(() => detailsCloseRef.current?.focus())
  }, [detailsOpen])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Keep adjacent gallery items warm while the viewer is open. This removes
  // the blank/loading flash when moving through photo-heavy galleries.
  useEffect(() => {
    preloadZoomGalleryNeighbors(gallery)
  }, [gallery])

  // Preload the viewer source set, letting the browser pick the right Vercel
  // optimized rendition for this viewport instead of fetching the raw source.
  useEffect(() => {
    if (!image.fullSrc) return
    let cancelled = false
    const hd = new Image()
    hd.onload = () => {
      const width = image.width ?? hd.naturalWidth
      const height = image.height ?? hd.naturalHeight
      if (cancelled || !width || !height) return
      setHdSize({ width, height })
    }
    if (image.fullSizes) hd.sizes = image.fullSizes
    if (image.fullSrcSet) hd.srcset = image.fullSrcSet
    hd.src = image.fullSrc
    return () => {
      cancelled = true
    }
  }, [
    image.fullSrc,
    image.fullSrcSet,
    image.fullSizes,
    image.width,
    image.height,
  ])

  const imageResetKey = `${image.src}\n${image.fullSrc ?? ''}\n${image.fullSrcSet ?? ''}\n${image.fullSizes ?? ''}`
  useEffect(() => {
    if (!imageResetKey) return
    setHdSize(null)
    setUpgrade(null)
    setImmediateLoaded(Boolean(immediateRef.current?.complete))
  }, [imageResetKey])

  // Apply the upgrade once the open animation has settled, so the layout
  // never changes mid-zoom. Reduced motion swaps instantly.
  useEffect(() => {
    if (!hdSize || upgrade || phase !== 'open') return
    const immediate = immediateRef.current
    const outgoingRect = immediate
      ? containedImageRect(
          immediate.getBoundingClientRect(),
          (image.width ?? immediate.naturalWidth) || null,
          (image.height ?? immediate.naturalHeight) || null
        )
      : null
    setUpgrade({
      ...hdSize,
      fading: !prefersReducedMotion(),
      outgoingWidth: outgoingRect?.width ?? 0,
      outgoingHeight: outgoingRect?.height ?? 0,
    })
  }, [hdSize, image.height, image.width, upgrade, phase])

  // End the crossfade: unmount the outgoing image.
  useEffect(() => {
    if (!upgrade?.fading) return
    const timer = setTimeout(
      () => setUpgrade((u) => (u ? { ...u, fading: false } : u)),
      FADE_MS
    )
    return () => clearTimeout(timer)
  }, [upgrade])

  const fullSrc = image.fullSrc
  const caption = image.caption ?? null
  const hasCaption = caption !== null
  const showFull = upgrade !== null && fullSrc !== null
  const showImmediate = upgrade === null || upgrade.fading
  const showLoadingSurface = showImmediate && !showFull && !immediateLoaded
  const loadingDimensions = showLoadingSurface
    ? containedLoadingDimensions(image, hasCaption, isImmersive, detailsOpen)
    : null
  const holdOutgoing =
    upgrade !== null && upgrade.outgoingWidth > 0 && upgrade.outgoingHeight > 0
  const imageBounds = isImmersive
    ? 'h-full w-full object-contain'
    : hasCaption
      ? 'max-h-[58vh] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[62vh] landscape:max-h-screen landscape:max-w-full md:max-h-screen md:max-w-full'
      : 'max-h-[90vh] max-w-[90vw] object-contain'
  const hasCaptionMetadata = Boolean(caption?.date || caption?.locationName)
  const collection =
    caption?.collection === 'umami'
      ? {
          href: '/umami',
          label: 'umami',
          logo: '/images/umami.svg',
          width: 1562,
          height: 369,
        }
      : {
          href: '/tsundoku',
          label: 'Tsundoku',
          logo: '/images/tsundoku.svg',
          width: 884,
          height: 135,
        }
  const handleCaptionClick = useCallback((e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
  }, [])
  const handleOriginalLinkClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation()
    },
    []
  )
  const handleLogoClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return
      }
      if (!onNavigateTo) return
      e.preventDefault()
      onNavigateTo(collection.href)
    },
    [collection.href, onNavigateTo]
  )
  const handlePostClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return
      }
      if (!caption?.href || !onNavigateTo) return
      e.preventDefault()
      onNavigateTo(caption.href)
    },
    [caption?.href, onNavigateTo]
  )
  const handleImmediateLoad = useCallback(() => setImmediateLoaded(true), [])
  const handleCaptionPanelClick = useCallback(
    (e: MouseEvent<HTMLElement>) => e.stopPropagation(),
    []
  )
  const handleDetailsToggle = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      setDetailsOpen((open) => !open)
    },
    []
  )
  const handleDetailsClose = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      closeDetails()
    },
    [closeDetails]
  )
  const handleCloseButton = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      handleClose()
    },
    [handleClose]
  )
  const handlePrevious = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      if (!canPrevious) return
      onNavigate?.(-1)
    },
    [canPrevious, onNavigate]
  )
  const handleNext = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      if (!canNext) return
      onNavigate?.(1)
    },
    [canNext, onNavigate]
  )
  const handleBackdropClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (didSwipeRef.current) {
        didSwipeRef.current = false
        if (swipeClickResetTimerRef.current !== null) {
          window.clearTimeout(swipeClickResetTimerRef.current)
          swipeClickResetTimerRef.current = null
        }
        e.stopPropagation()
        return
      }
      handleClose()
    },
    [handleClose]
  )
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isImmersive || e.pointerType === 'mouse') return
      const target = e.target
      if (
        target instanceof Element &&
        target.closest('a, button, [data-zoom-caption-panel]')
      ) {
        return
      }
      swipeRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [isImmersive]
  )
  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const start = swipeRef.current
      swipeRef.current = null
      if (!start || start.pointerId !== e.pointerId) return
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }

      const deltaX = e.clientX - start.x
      const deltaY = e.clientY - start.y
      if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return

      didSwipeRef.current = true
      if (swipeClickResetTimerRef.current !== null) {
        window.clearTimeout(swipeClickResetTimerRef.current)
      }
      // A swipe's synthetic click arrives before the next task. If the browser
      // suppresses that click entirely, release the guard immediately so the
      // visitor's next ordinary tap still closes the viewer.
      swipeClickResetTimerRef.current = window.setTimeout(() => {
        didSwipeRef.current = false
        swipeClickResetTimerRef.current = null
      }, 0)
      if (deltaX > 0 && canPrevious) onNavigate?.(-1)
      if (deltaX < 0 && canNext) onNavigate?.(1)
    },
    [canNext, canPrevious, onNavigate]
  )
  const handlePointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (swipeRef.current?.pointerId === e.pointerId) swipeRef.current = null
    },
    []
  )

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={
        isImmersive && caption?.collection === 'umami'
          ? 'umami photo viewer'
          : image.alt || 'Image viewer'
      }
      aria-describedby={isImmersive && caption ? statusId : undefined}
      data-image-zoom-overlay=""
      tabIndex={-1}
      className={`fixed inset-0 z-60 cursor-zoom-out bg-[#0A0A0A] ${
        phase === 'closing' ? 'image-zoom-closing' : 'image-zoom-opening'
      }`}
      style={{
        touchAction: isImmersive
          ? 'pan-y pinch-zoom'
          : hasCaption
            ? 'auto'
            : 'none',
      }}
      onClick={handleBackdropClick}
    >
      {isImmersive && caption ? (
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {image.alt || caption.title}
          {hasGallery && gallery
            ? `, image ${gallery.index + 1} of ${gallery.items.length}`
            : ''}
          .
        </p>
      ) : null}
      {!caption ? (
        <button
          type="button"
          onClick={handleCloseButton}
          aria-label="Close image viewer"
          className="absolute top-3 right-3 z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-white transition-[background-color,color,opacity] hover:bg-black/70 focus-visible:bg-black/70 sm:top-4 sm:right-4"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : null}
      <div
        className={
          isImmersive
            ? detailsOpen
              ? 'grid h-full w-full grid-rows-[minmax(0,1fr)_auto] landscape:grid-cols-[minmax(0,1fr)_min(42vw,24rem)] landscape:grid-rows-1 md:grid-cols-[minmax(0,1fr)_min(34vw,24rem)] md:grid-rows-1'
              : 'h-full w-full'
            : hasCaption
              ? 'grid h-full w-full grid-rows-[minmax(0,1fr)_auto] landscape:grid-cols-[minmax(0,1fr)_clamp(14rem,32vw,26rem)] landscape:grid-rows-1 md:grid-cols-[minmax(0,1fr)_clamp(14rem,32vw,26rem)] md:grid-rows-1'
              : 'flex h-full w-full items-center justify-center'
        }
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className={
            isImmersive
              ? 'immersive-zoom-stage group relative flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden bg-[#0A0A0A]'
              : hasCaption
                ? 'group relative flex min-h-0 items-center justify-center overflow-hidden bg-[#0A0A0A] p-2 sm:p-3 landscape:h-screen landscape:p-0 md:h-screen md:p-0'
                : 'group relative flex h-full w-full items-center justify-center'
          }
        >
          {isImmersive && !detailsOpen ? (
            <button
              type="button"
              onClick={handleCloseButton}
              aria-label="Close image viewer"
              className="immersive-zoom-chrome absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-30 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white transition-[background-color,color,opacity] hover:bg-black/70 focus-visible:bg-black/70"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          ) : null}
          {/* The full image defines the layout once it has loaded; the
              outgoing image is pinned over it at its captured size so the
              crossfade never moves pixels. */}
          <div
            ref={containerRef}
            className={`relative ${isImmersive ? 'flex h-full w-full items-center justify-center' : ''} ${showLoadingSurface ? 'image-zoom-loading-surface' : ''}`}
            style={
              loadingDimensions
                ? {
                    width: loadingDimensions.width,
                    height: loadingDimensions.height,
                  }
                : undefined
            }
          >
            {showFull ? (
              // biome-ignore lint/performance/noImgElement: the overlay needs a plain img for the FLIP/crossfade layers
              <img
                key="full"
                src={fullSrc}
                srcSet={image.fullSrcSet ?? undefined}
                sizes={
                  image.fullSrcSet ? (image.fullSizes ?? undefined) : undefined
                }
                alt={image.alt}
                width={upgrade.width}
                height={upgrade.height}
                className={`${imageBounds}${
                  upgrade.fading ? ' image-zoom-hd-in' : ''
                }`}
                draggable={false}
              />
            ) : null}
            {showImmediate ? (
              // biome-ignore lint/performance/noImgElement: mirrors the clicked image's already-loaded source
              <img
                key="immediate"
                ref={immediateRef}
                src={image.src}
                alt={showFull ? '' : image.alt}
                aria-hidden={showFull || undefined}
                onLoad={handleImmediateLoad}
                onError={handleImmediateLoad}
                className={
                  showFull
                    ? holdOutgoing
                      ? 'image-zoom-hd-out -translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 max-h-none max-w-none'
                      : 'image-zoom-hd-out absolute inset-0 h-full w-full object-contain'
                    : imageBounds
                }
                style={
                  showFull && holdOutgoing
                    ? {
                        width: upgrade.outgoingWidth,
                        height: upgrade.outgoingHeight,
                      }
                    : undefined
                }
                draggable={false}
              />
            ) : null}
          </div>
          {hasGallery && (!isImmersive || !detailsOpen) ? (
            <>
              <button
                type="button"
                onClick={handlePrevious}
                aria-label="Previous image"
                disabled={!canPrevious}
                className={`-translate-y-1/2 absolute top-1/2 z-20 flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,color,opacity] ${
                  canPrevious
                    ? isImmersive
                      ? 'immersive-zoom-chrome left-[max(0.75rem,env(safe-area-inset-left))] cursor-pointer bg-black/50 text-white opacity-100 hover:bg-black/70 focus-visible:bg-black/70'
                      : 'left-3 cursor-pointer bg-black/35 text-white opacity-100 hover:bg-black/50 focus-visible:bg-black/50 md:left-4 md:bg-black/0 md:opacity-0 md:group-focus-within:bg-black/35 md:group-focus-within:opacity-100 md:group-hover:bg-black/35 md:group-hover:opacity-100'
                    : 'left-3 pointer-events-none text-white/15 opacity-0'
                }`}
              >
                <ChevronLeft aria-hidden="true" className="h-7 w-7" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next image"
                disabled={!canNext}
                className={`-translate-y-1/2 absolute top-1/2 z-20 flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,color,opacity] ${
                  canNext
                    ? isImmersive
                      ? 'immersive-zoom-chrome right-[max(0.75rem,env(safe-area-inset-right))] cursor-pointer bg-black/50 text-white opacity-100 hover:bg-black/70 focus-visible:bg-black/70'
                      : 'right-3 cursor-pointer bg-black/35 text-white opacity-100 hover:bg-black/50 focus-visible:bg-black/50 md:right-4 md:bg-black/0 md:opacity-0 md:group-focus-within:bg-black/35 md:group-focus-within:opacity-100 md:group-hover:bg-black/35 md:group-hover:opacity-100'
                    : 'right-3 pointer-events-none text-white/15 opacity-0'
                }`}
              >
                <ChevronRight aria-hidden="true" className="h-7 w-7" />
              </button>
            </>
          ) : null}
          {image.originalSrc && (!isImmersive || !detailsOpen) ? (
            <a
              href={image.originalSrc}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original image in new tab"
              title="Open original image"
              onClick={handleOriginalLinkClick}
              className={`absolute z-20 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-white opacity-100 transition-[background-color,color,opacity] hover:bg-black/70 focus-visible:bg-black/70 ${
                isImmersive
                  ? 'immersive-zoom-chrome right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] bg-black/50'
                  : 'right-3 bottom-3 bg-black/35 md:right-4 md:bottom-4 md:bg-black/0 md:opacity-0 md:group-focus-within:bg-black/35 md:group-focus-within:opacity-100 md:group-hover:bg-black/35 md:group-hover:opacity-100'
              }`}
            >
              <ExternalLink aria-hidden="true" className="h-5 w-5" />
            </a>
          ) : null}
          {isImmersive && caption && !detailsOpen ? (
            <button
              ref={detailsToggleRef}
              type="button"
              aria-label="Show photo details"
              aria-controls={detailsId}
              aria-expanded={detailsOpen}
              title="Photo details"
              onClick={handleDetailsToggle}
              className="immersive-zoom-chrome absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] z-20 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-black/50 text-white transition-[background-color,color,opacity] hover:bg-black/70 focus-visible:bg-black/70"
            >
              <Info aria-hidden="true" className="h-5 w-5" />
            </button>
          ) : null}
        </div>
        {isImmersive && caption && detailsOpen ? (
          <aside
            id={detailsId}
            data-zoom-caption-panel=""
            role="region"
            aria-label="Photo details"
            tabIndex={0}
            className="min-h-0 min-w-0 max-h-[min(42dvh,20rem)] w-full cursor-auto overflow-y-auto overscroll-contain bg-[#171717] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white landscape:h-full landscape:max-h-none landscape:py-6 landscape:pr-[max(1.5rem,env(safe-area-inset-right))] landscape:pl-6 md:h-full md:max-h-none md:py-8 md:pr-8 md:pl-8"
            onClick={handleCaptionPanelClick}
          >
            <div className="flex min-h-full flex-col">
              <div className="flex min-h-12 shrink-0 items-start justify-end gap-1">
                {hasGallery && gallery ? (
                  <span
                    aria-hidden="true"
                    className="pt-3.5 font-sans text-[11px] leading-5 text-white/55"
                  >
                    {gallery.index + 1} / {gallery.items.length}
                  </span>
                ) : null}
                <button
                  ref={detailsCloseRef}
                  type="button"
                  aria-label="Collapse photo details"
                  title="Collapse photo details"
                  onClick={handleDetailsClose}
                  className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white"
                >
                  <ChevronDown
                    aria-hidden="true"
                    className="h-4 w-4 landscape:hidden md:hidden"
                  />
                  <PanelRightClose
                    aria-hidden="true"
                    className="hidden h-4 w-4 landscape:block md:block"
                  />
                </button>
                <button
                  type="button"
                  aria-label="Close image viewer"
                  title="Close image viewer"
                  onClick={handleCloseButton}
                  className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 pt-3 landscape:pt-6 md:pt-8">
                {hasCaptionMetadata ? (
                  <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[11px] leading-5 text-white/65">
                    {caption.date ? <time>{caption.date}</time> : null}
                    {caption.date && caption.locationName ? (
                      <span aria-hidden="true">@</span>
                    ) : null}
                    {caption.locationName ? (
                      caption.locationUrl ? (
                        <a
                          href={caption.locationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-words underline decoration-white/35 underline-offset-2 transition-colors hover:text-white"
                          onClick={handleCaptionClick}
                        >
                          {caption.locationName}
                        </a>
                      ) : (
                        <span>{caption.locationName}</span>
                      )
                    ) : null}
                  </div>
                ) : null}
                <h2 className="break-words font-serif text-lg font-normal leading-snug text-white sm:text-xl">
                  {caption.title}
                </h2>
                {caption.description ? (
                  <p className="mt-4 break-words font-serif text-sm leading-6 text-white/80 sm:text-base sm:leading-7">
                    {caption.description}
                  </p>
                ) : null}
              </div>
              <footer className="mt-6 flex shrink-0 flex-wrap items-end justify-between gap-x-5 gap-y-3 landscape:mt-auto md:mt-auto">
                <Link
                  href={collection.href}
                  aria-label={collection.label}
                  className="inline-flex min-h-11 shrink-0 items-center transition-opacity hover:opacity-80"
                  onClick={handleLogoClick}
                >
                  <NextImage
                    src={collection.logo}
                    alt={collection.label}
                    width={collection.width}
                    height={collection.height}
                    className="h-[16px] w-auto"
                  />
                </Link>
                {caption.href ? (
                  <Link
                    href={caption.href}
                    className="inline-flex min-h-11 items-center font-sans text-sm text-white/85 underline decoration-white/35 underline-offset-4 transition-colors hover:text-white"
                    onClick={handlePostClick}
                  >
                    Open post&nbsp;→
                  </Link>
                ) : null}
              </footer>
            </div>
          </aside>
        ) : null}
        {caption && !isImmersive ? (
          <aside
            data-zoom-caption-panel=""
            className="min-w-0 max-h-[42vh] w-full cursor-auto overflow-hidden overscroll-contain border-gray-200 border-t bg-[#f4f4f2] text-gray-900 landscape:h-screen landscape:max-h-none landscape:border-t-0 landscape:border-l md:h-screen md:max-h-none md:border-t-0 md:border-l"
            onClick={handleCaptionPanelClick}
          >
            <div className="flex h-full max-h-[42vh] flex-col landscape:max-h-none md:max-h-none">
              <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-2 md:px-7 md:pt-7">
                <div className="min-w-0">
                  {hasCaptionMetadata ? (
                    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] leading-5 text-gray-500">
                      {caption.date ? <time>{caption.date}</time> : null}
                      {caption.date && caption.locationName ? (
                        <span aria-hidden="true">@</span>
                      ) : null}
                      {caption.locationName ? (
                        caption.locationUrl ? (
                          <a
                            href={caption.locationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-words underline decoration-gray-300 underline-offset-2 transition-colors hover:text-sun"
                            onClick={handleCaptionClick}
                          >
                            {caption.locationName}
                          </a>
                        ) : (
                          <span>{caption.locationName}</span>
                        )
                      ) : null}
                    </div>
                  ) : null}
                  <h2 className="break-words font-sans text-xl font-semibold leading-snug text-gray-950 md:text-2xl">
                    {caption.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleCloseButton}
                  aria-label="Close image viewer"
                  className="-mt-2 -mr-2 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-gray-500 transition-colors hover:text-gray-950"
                >
                  <X aria-hidden="true" className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-1 pb-6 md:px-7 md:pt-2 md:pb-7">
                {caption.description ? (
                  <p className="mt-2 break-words font-serif text-base leading-7 text-gray-700 md:mt-4">
                    {caption.description}
                  </p>
                ) : null}
              </div>
              {caption.footer && caption.footer.links.length > 0 ? (
                <footer className="shrink-0 border-gray-200 border-t px-5 py-4 md:px-7 md:py-5">
                  <h3 className="font-sans text-xs font-semibold text-gray-500">
                    {caption.footer.heading}
                  </h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 landscape:grid-cols-1 md:grid-cols-1">
                    {caption.footer.links.map((link) => (
                      <Link
                        key={`${link.href}-${link.title}`}
                        href={link.href}
                        className="group flex min-w-0 items-start justify-between gap-3 border border-gray-200 bg-white/45 py-2.5 pr-3 pl-12 transition-colors hover:border-gray-300 hover:bg-white sm:px-3"
                        onClick={handleCaptionClick}
                      >
                        <span className="min-w-0">
                          {link.meta ? (
                            <span className="block font-mono text-[10px] leading-4 text-gray-500">
                              {link.meta}
                            </span>
                          ) : null}
                          <span className="mt-0.5 block break-words font-sans text-sm font-semibold leading-snug text-gray-900">
                            {link.title}
                          </span>
                        </span>
                        <ArrowIcon className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors group-hover:text-gray-900" />
                      </Link>
                    ))}
                  </div>
                </footer>
              ) : caption.href ? (
                <footer className="flex shrink-0 items-center justify-between gap-4 border-gray-200 border-t px-5 py-4 md:px-7 md:py-5">
                  <Link
                    href={collection.href}
                    aria-label={collection.label}
                    className="shrink-0 transition-opacity hover:opacity-80"
                    onClick={handleLogoClick}
                  >
                    <NextImage
                      src={collection.logo}
                      alt={collection.label}
                      width={collection.width}
                      height={collection.height}
                      className="h-[14px] w-auto"
                    />
                  </Link>
                  <Link
                    href={caption.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 font-sans text-sm font-semibold text-gray-900 transition-colors hover:text-sun"
                    onClick={handleCaptionClick}
                  >
                    Open post
                    <span
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      <ArrowIcon className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </footer>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
