'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

export interface ZoomedImage {
  src: string
  fullSrc: string | null
  alt: string
}

export function ImageZoomOverlay({
  image,
  onClose,
}: {
  image: ZoomedImage
  onClose: () => void
}) {
  const [displaySrc, setDisplaySrc] = useState(image.src)
  const [closing, setClosing] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Preload full-res image
  useEffect(() => {
    if (!image.fullSrc) return
    const hd = new Image()
    hd.onload = () => setDisplaySrc(image.fullSrc!)
    hd.src = image.fullSrc
  }, [image.fullSrc])

  // Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

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

  return (
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-60 flex items-center justify-center bg-[#0A0A0A]/95 ${
        closing ? 'image-zoom-closing' : 'image-zoom-opening'
      }`}
      style={{ touchAction: 'none' }}
      onClick={handleClose}
    >
      <TransformWrapper
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
          <img
            src={displaySrc}
            alt={image.alt}
            className="max-h-[95vh] max-w-[95vw] object-contain"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
