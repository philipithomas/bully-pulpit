'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ReactZoomPanPinchRef,
  TransformComponent,
  TransformWrapper,
} from 'react-zoom-pan-pinch'

export interface ZoomedImage {
  src: string
  fullSrc: string | null
  alt: string
}

// Duration of the upgrade crossfade. Keep in sync with the
// .image-zoom-hd-in and .image-zoom-hd-out classes in globals.css.
const FADE_MS = 300

// Aspect ratios within two percent of each other count as the same frame.
const ASPECT_TOLERANCE = 0.02

interface Upgrade {
  width: number
  height: number
  // True when the full image is a different framing from the clicked image
  // (the mobile homepage crop zooms out to the full portrait), so the two
  // crossfade and the view recenters. When false the full image is the same
  // frame at higher resolution: it sits underneath at full opacity while the
  // low-res copy fades away, which reads as the image sharpening in place.
  aspectChanged: boolean
  fading: boolean
  // Layout size of the outgoing image at upgrade time, used to hold it
  // perfectly still during an aspect-changing dissolve.
  outgoingWidth: number
  outgoingHeight: number
}

export function ImageZoomOverlay({
  image,
  onClose,
}: {
  image: ZoomedImage
  onClose: () => void
}) {
  const [upgrade, setUpgrade] = useState<Upgrade | null>(null)
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const immediateRef = useRef<HTMLImageElement>(null)
  const transformRef = useRef<ReactZoomPanPinchRef>(null)

  // Preload the full-res image, then fade it in. Reduced motion gets an
  // instant swap instead.
  useEffect(() => {
    if (!image.fullSrc) return
    let cancelled = false
    const hd = new Image()
    hd.onload = () => {
      if (cancelled || !hd.naturalWidth || !hd.naturalHeight) return
      const immediate = immediateRef.current
      const immediateAspect =
        immediate && immediate.naturalHeight > 0
          ? immediate.naturalWidth / immediate.naturalHeight
          : null
      const fullAspect = hd.naturalWidth / hd.naturalHeight
      const aspectChanged =
        immediateAspect !== null &&
        Math.abs(fullAspect - immediateAspect) / immediateAspect >
          ASPECT_TOLERANCE
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches
      setUpgrade({
        width: hd.naturalWidth,
        height: hd.naturalHeight,
        aspectChanged,
        fading: !reduceMotion,
        outgoingWidth: immediate?.offsetWidth ?? 0,
        outgoingHeight: immediate?.offsetHeight ?? 0,
      })
      if (reduceMotion && aspectChanged) {
        transformRef.current?.resetTransform(0)
      }
    }
    hd.src = image.fullSrc
    return () => {
      cancelled = true
    }
  }, [image.fullSrc])

  // End the fade: unmount the outgoing image and, when the framing changed,
  // recenter the view so a pan or zoom made before the upgrade does not
  // leave the new image off screen.
  useEffect(() => {
    if (!upgrade?.fading) return
    const timer = setTimeout(() => {
      setUpgrade((u) => (u ? { ...u, fading: false } : u))
      if (upgrade.aspectChanged) {
        transformRef.current?.resetTransform(200)
      }
    }, FADE_MS)
    return () => clearTimeout(timer)
  }, [upgrade])

  // Escape closes; Tab stays on the container. The overlay is a single
  // control surface with no focusable children, so holding focus on the
  // container is a sufficient trap.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
      if (e.key === 'Tab') {
        e.preventDefault()
        overlayRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

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

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, 150)
  }, [onClose])

  const fullSrc = image.fullSrc
  const showFull = upgrade !== null && fullSrc !== null
  const showImmediate = upgrade === null || upgrade.fading
  // Same frame: stretch the outgoing copy over the full image so the upgrade
  // is a sharpen in place. Different frame: pin the outgoing image at its
  // captured size so it dissolves without moving.
  const holdOutgoing =
    upgrade?.aspectChanged === true &&
    upgrade.outgoingWidth > 0 &&
    upgrade.outgoingHeight > 0

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || 'Image viewer'}
      tabIndex={-1}
      className={`fixed inset-0 z-60 flex items-center justify-center bg-[#0A0A0A]/95 ${
        closing ? 'image-zoom-closing' : 'image-zoom-opening'
      }`}
      style={{ touchAction: 'none' }}
      onClick={handleClose}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.5}
        maxScale={10}
        centerOnInit
        wheel={{ step: 0.15 }}
        doubleClick={{ mode: 'reset' }}
        panning={{ velocityDisabled: true }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100vw', height: '100vh' }}
          contentStyle={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The full image defines the layout once it has loaded; the
              outgoing image is layered absolutely over it so the box never
              stretches mid-fade. */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {upgrade && fullSrc && (
              // biome-ignore lint/performance/noImgElement: the overlay renders the raw full-resolution asset at runtime
              <img
                key="full"
                src={fullSrc}
                alt={image.alt}
                width={upgrade.width}
                height={upgrade.height}
                className={`max-h-[95vh] max-w-[95vw] object-contain${
                  upgrade.fading && upgrade.aspectChanged
                    ? ' image-zoom-hd-in'
                    : ''
                }`}
                draggable={false}
              />
            )}
            {showImmediate && (
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
                      ? 'image-zoom-hd-out absolute top-1/2 left-1/2 max-h-none max-w-none -translate-x-1/2 -translate-y-1/2'
                      : 'image-zoom-hd-out absolute inset-0 h-full w-full object-contain'
                    : 'max-h-[95vh] max-w-[95vw] object-contain'
                }
                style={
                  showFull && holdOutgoing && upgrade
                    ? {
                        width: upgrade.outgoingWidth,
                        height: upgrade.outgoingHeight,
                      }
                    : undefined
                }
                draggable={false}
              />
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
