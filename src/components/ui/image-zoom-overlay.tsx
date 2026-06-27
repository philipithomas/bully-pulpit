'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

export interface ZoomGalleryItem {
  src: string
  fullSrc: string | null
  alt: string
  caption?: {
    href: string
    title: string
    description?: string | null
  } | null
}

export interface ZoomedImage {
  src: string
  fullSrc: string | null
  alt: string
  /** Optional post caption shown in the overlay; omitted for plain galleries. */
  caption?: {
    href: string
    title: string
    description?: string | null
  } | null
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
  const overlayRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const immediateRef = useRef<HTMLImageElement>(null)
  const captionLinkRef = useRef<HTMLAnchorElement>(null)
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

  // Escape closes; Tab is trapped. Without a caption the overlay has no
  // focusable children, so holding focus on the container is a sufficient
  // trap. With a caption link there are exactly two stops, so cycling in
  // either direction is a toggle between the container and the link.
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
        const link = captionLinkRef.current
        if (link && document.activeElement !== link) {
          link.focus()
        } else {
          overlayRef.current?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [canNext, canPrevious, handleClose, hasGallery, onNavigate])

  // Scrolling closes, like medium-zoom: the reader is leaving, get out of
  // the way.
  useEffect(() => {
    const close = () => handleClose()
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

  const caption = image.caption ?? null
  const hasCaption = caption !== null
  const fullSrc = image.fullSrc
  const showFull = upgrade !== null && fullSrc !== null
  const showImmediate = upgrade === null || upgrade.fading
  const holdOutgoing =
    upgrade !== null && upgrade.outgoingWidth > 0 && upgrade.outgoingHeight > 0
  const imageBounds = hasCaption
    ? 'max-h-[62vh] max-w-[calc(100vw-2rem)] object-contain md:max-h-[calc(100vh-2rem)] md:max-w-[calc(100vw-24rem)]'
    : 'max-h-[90vh] max-w-[90vw] object-contain'
  const handleCaptionClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation(),
    []
  )
  const handleCaptionPanelClick = useCallback(
    (e: MouseEvent<HTMLElement>) => e.stopPropagation(),
    []
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
      className={`fixed inset-0 z-60 cursor-zoom-out bg-[#0A0A0A]/95 ${
        phase === 'closing' ? 'image-zoom-closing' : 'image-zoom-opening'
      }`}
      style={{ touchAction: 'none' }}
      onClick={handleClose}
    >
      <div
        className={
          hasCaption
            ? 'flex h-full w-full flex-col md:flex-row'
            : 'flex h-full w-full items-center justify-center'
        }
      >
        <div
          className={
            hasCaption
              ? 'relative flex min-h-0 flex-1 items-center justify-center p-4 md:p-6'
              : 'relative flex h-full w-full items-center justify-center'
          }
        >
          {/* The full image defines the layout once it has loaded; the
              outgoing image is pinned over it at its captured size so the
              crossfade never moves pixels. */}
          <div ref={containerRef} className="relative">
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
                className={`-translate-y-1/2 absolute top-1/2 left-3 p-3 transition-colors md:left-4 ${
                  canPrevious
                    ? 'text-white/75 hover:text-white'
                    : 'cursor-default text-white/20'
                }`}
              >
                <ChevronLeft aria-hidden="true" className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next image"
                disabled={!canNext}
                className={`-translate-y-1/2 absolute top-1/2 right-3 p-3 transition-colors md:right-4 ${
                  canNext
                    ? 'text-white/75 hover:text-white'
                    : 'cursor-default text-white/20'
                }`}
              >
                <ChevronRight aria-hidden="true" className="h-8 w-8" />
              </button>
            </>
          )}
        </div>
        {caption ? (
          <aside
            className="max-h-[38vh] w-full shrink-0 cursor-auto overflow-y-auto bg-[#f4f4f2] px-5 py-5 text-gray-900 md:max-h-none md:h-full md:w-96 md:px-6 md:py-8"
            onClick={handleCaptionPanelClick}
          >
            <p className="font-sans text-base font-semibold leading-tight">
              {caption.title}
            </p>
            {caption.description ? (
              <p className="mt-4 font-serif text-sm leading-relaxed text-gray-700">
                {caption.description}
              </p>
            ) : null}
            <Link
              ref={captionLinkRef}
              href={caption.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex h-9 items-center bg-gray-950 px-3 font-sans text-xs font-medium text-white transition-colors hover:bg-sun"
              onClick={handleCaptionClick}
            >
              More
            </Link>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
