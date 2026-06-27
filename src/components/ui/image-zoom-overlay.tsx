'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

export interface ZoomCaption {
  href: string
  title: string
  description?: string | null
  date?: string | null
  locationName?: string | null
  locationUrl?: string | null
}

export interface ZoomGalleryItem {
  src: string
  fullSrc: string | null
  alt: string
  width: number | null
  height: number | null
  caption?: ZoomCaption | null
}

export interface ZoomedImage {
  src: string
  fullSrc: string | null
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

/** Transform that visually moves `node`'s layout box onto the source rect. */
function flipTransform(
  source: NonNullable<ZoomedImage['rect']>,
  layout: DOMRect
): string {
  const scale = source.width / layout.width
  const dx = source.left + source.width / 2 - (layout.left + layout.width / 2)
  const dy = source.top + source.height / 2 - (layout.top + layout.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

function focusableOverlayItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []

  return Array.from(
    container.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
  ).filter((el) => el.getClientRects().length > 0)
}

function containedLoadingDimensions(
  image: ZoomedImage,
  hasCaption: boolean
): { width: number; height: number } | null {
  const sourceWidth = image.width ?? image.rect?.width ?? null
  const sourceHeight = image.height ?? image.rect?.height ?? null
  if (!sourceWidth || !sourceHeight) return null

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const maxWidth = hasCaption
    ? viewportWidth >= 768
      ? Math.max(viewportWidth - 26 * 16, 1)
      : Math.max(viewportWidth - 16, 1)
    : viewportWidth * 0.9
  const maxHeight = hasCaption
    ? viewportWidth >= 768
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
}: {
  image: ZoomedImage
  onClose: () => void
  onNavigate?: (direction: -1 | 1) => void
}) {
  const [phase, setPhase] = useState<'opening' | 'open' | 'closing'>('opening')
  const [hdSize, setHdSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null)
  const [immediateLoaded, setImmediateLoaded] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const immediateRef = useRef<HTMLImageElement>(null)
  const closingRef = useRef(false)
  const gallery = image.gallery ?? null
  const hasGallery = Boolean(gallery && gallery.items.length > 1)
  const canPrevious = Boolean(gallery && gallery.index > 0)
  const canNext = Boolean(gallery && gallery.index < gallery.items.length - 1)

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
    const layout = node.getBoundingClientRect()
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
  }, [image.rect])

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
        node.getBoundingClientRect()
      )
      setTimeout(onClose, ZOOM_MS)
    } else {
      setTimeout(onClose, prefersReducedMotion() ? 0 : ZOOM_MS)
    }
  }, [image.rect, onClose, phase])

  // Escape closes; Tab is trapped among the visible overlay controls.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
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
  }, [canNext, canPrevious, handleClose, hasGallery, onNavigate])

  // Scrolling outside the details rail closes, like medium-zoom: the reader is
  // leaving, get out of the way.
  useEffect(() => {
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
  }, [handleClose])

  // Move focus into the overlay on mount; the opener restores it on close
  useEffect(() => {
    overlayRef.current?.focus()
  }, [])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Preload the full-resolution image.
  useEffect(() => {
    if (!image.fullSrc) return
    let cancelled = false
    const hd = new Image()
    hd.onload = () => {
      if (cancelled || !hd.naturalWidth || !hd.naturalHeight) return
      setHdSize({ width: hd.naturalWidth, height: hd.naturalHeight })
    }
    hd.src = image.fullSrc
    return () => {
      cancelled = true
    }
  }, [image.fullSrc])

  const imageResetKey = `${image.src}\n${image.fullSrc ?? ''}`
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
    setUpgrade({
      ...hdSize,
      fading: !prefersReducedMotion(),
      outgoingWidth: immediate?.offsetWidth ?? 0,
      outgoingHeight: immediate?.offsetHeight ?? 0,
    })
  }, [hdSize, upgrade, phase])

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
    ? containedLoadingDimensions(image, hasCaption)
    : null
  const holdOutgoing =
    upgrade !== null && upgrade.outgoingWidth > 0 && upgrade.outgoingHeight > 0
  const imageBounds = hasCaption
    ? 'max-h-[58vh] max-w-[calc(100vw-1rem)] object-contain sm:max-h-[62vh] md:max-h-screen md:max-w-full'
    : 'max-h-[90vh] max-w-[90vw] object-contain'
  const hasCaptionMetadata = Boolean(caption?.date || caption?.locationName)
  const handleCaptionClick = useCallback((e: MouseEvent<HTMLElement>) => {
    e.stopPropagation()
  }, [])
  const handleImmediateLoad = useCallback(() => setImmediateLoaded(true), [])
  const handleCaptionPanelClick = useCallback(
    (e: MouseEvent<HTMLElement>) => e.stopPropagation(),
    []
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

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || 'Image viewer'}
      tabIndex={-1}
      className={`fixed inset-0 z-60 cursor-zoom-out bg-[#0A0A0A] ${
        phase === 'closing' ? 'image-zoom-closing' : 'image-zoom-opening'
      }`}
      style={{ touchAction: hasCaption ? 'auto' : 'none' }}
      onClick={handleClose}
    >
      {!caption ? (
        <button
          type="button"
          onClick={handleCloseButton}
          aria-label="Close image viewer"
          className="absolute top-3 right-3 z-20 flex h-10 w-10 cursor-pointer items-center justify-center text-white/70 transition-colors hover:text-white sm:top-4 sm:right-4"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>
      ) : null}
      <div
        className={
          hasCaption
            ? 'grid h-full w-full grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_26rem] md:grid-rows-1'
            : 'flex h-full w-full items-center justify-center'
        }
      >
        <div
          className={
            hasCaption
              ? 'group relative flex min-h-0 items-center justify-center overflow-hidden bg-[#0A0A0A] p-2 sm:p-3 md:h-screen md:p-0'
              : 'group relative flex h-full w-full items-center justify-center'
          }
        >
          {/* The full image defines the layout once it has loaded; the
              outgoing image is pinned over it at its captured size so the
              crossfade never moves pixels. */}
          <div
            ref={containerRef}
            className={`relative ${showLoadingSurface ? 'image-zoom-loading-surface' : ''}`}
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
              // biome-ignore lint/performance/noImgElement: the overlay renders the raw full-resolution asset at runtime
              <img
                key="full"
                src={fullSrc}
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
          {hasGallery && (
            <>
              <button
                type="button"
                onClick={handlePrevious}
                aria-label="Previous image"
                disabled={!canPrevious}
                className={`-translate-y-1/2 absolute top-1/2 left-3 flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,color,opacity] md:left-4 ${
                  canPrevious
                    ? 'cursor-pointer bg-black/0 text-white/75 opacity-100 hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100'
                    : 'pointer-events-none text-white/15 opacity-0'
                }`}
              >
                <ChevronLeft aria-hidden="true" className="h-7 w-7" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next image"
                disabled={!canNext}
                className={`-translate-y-1/2 absolute top-1/2 right-3 flex h-12 w-12 items-center justify-center rounded-full transition-[background-color,color,opacity] md:right-4 ${
                  canNext
                    ? 'cursor-pointer bg-black/0 text-white/75 opacity-100 hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100'
                    : 'pointer-events-none text-white/15 opacity-0'
                }`}
              >
                <ChevronRight aria-hidden="true" className="h-7 w-7" />
              </button>
            </>
          )}
        </div>
        {caption ? (
          <aside
            data-zoom-caption-panel=""
            className="max-h-[42vh] w-full cursor-auto overflow-hidden overscroll-contain border-gray-200 border-t bg-[#f4f4f2] text-gray-900 md:h-screen md:max-h-none md:border-t-0 md:border-l"
            onClick={handleCaptionPanelClick}
          >
            <div className="flex h-full max-h-[42vh] flex-col md:max-h-none">
              <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-2 md:px-7 md:pt-7">
                <div className="min-w-0">
                  {hasCaptionMetadata ? (
                    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-gray-500">
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
                            className="underline decoration-gray-300 underline-offset-2 transition-colors hover:text-sun"
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
                  <h2 className="font-sans text-xl font-semibold leading-tight text-gray-950 md:text-2xl">
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
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-7">
                {caption.description ? (
                  <p className="mt-3 font-serif text-base leading-relaxed text-gray-700 md:mt-5">
                    {caption.description}
                  </p>
                ) : null}
              </div>
              <footer className="flex shrink-0 items-center justify-end gap-4 border-gray-200 border-t px-5 py-4 sm:justify-between md:px-7 md:py-5">
                <span className="hidden font-sans text-xs text-gray-400 sm:inline">
                  Tsundoku
                </span>
                <Link
                  href={caption.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-gray-900 transition-colors hover:text-sun"
                  onClick={handleCaptionClick}
                >
                  Open post
                  <span aria-hidden="true">-&gt;</span>
                </Link>
              </footer>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
