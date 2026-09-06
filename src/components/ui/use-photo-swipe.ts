'use client'

import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react'
import {
  type PhotoSwipeDirection,
  PhotoSwipeGesture,
} from '@/lib/content/photo-swipe'

export function usePhotoSwipe({
  enabled,
  onSwipe,
}: {
  enabled: boolean
  onSwipe: (direction: PhotoSwipeDirection) => void
}) {
  const gesture = useRef(new PhotoSwipeGesture())
  const suppressClickUntil = useRef(0)

  useEffect(() => {
    const current = gesture.current
    current.reset()
    if (!enabled) return

    // Observe all touches, including a second finger landing outside the photo.
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      current.pointerDown({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        eligible: false,
        viewportWidth: window.innerWidth,
      })
    }
    const end = (event: PointerEvent) => current.pointerCancel(event.pointerId)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
      current.reset()
    }
  }, [enabled])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      suppressClickUntil.current = 0
      if (!enabled || event.pointerType !== 'touch') return
      const target = event.target
      const control =
        target instanceof Element
          ? target.closest(
              'a, button, input, select, textarea, summary, [role="button"], [data-zoom-caption-panel]'
            )
          : null
      if (control && !control.matches('button[data-zoomable]')) return

      gesture.current.pointerDown({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        eligible: true,
        viewportWidth: window.innerWidth,
        viewportScale: window.visualViewport?.scale,
      })
    },
    [enabled]
  )
  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    gesture.current.pointerMove(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
  }, [])
  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const direction = gesture.current.pointerUp(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      })
      if (!enabled || direction === null) return
      // A new pointerdown clears this guard, so the next real tap still works.
      suppressClickUntil.current = Date.now() + 500
      onSwipe(direction)
    },
    [enabled, onSwipe]
  )
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      gesture.current.pointerCancel(event.pointerId)
    },
    []
  )
  const onClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.detail === 0 || Date.now() > suppressClickUntil.current) return
    suppressClickUntil.current = 0
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
  }
}
