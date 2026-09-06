import { describe, expect, it } from 'vitest'
import { PhotoSwipeGesture } from '@/lib/content/photo-swipe'

function begin(
  gesture: PhotoSwipeGesture,
  pointerId = 1,
  overrides: Partial<Parameters<PhotoSwipeGesture['pointerDown']>[0]> = {}
) {
  gesture.pointerDown({
    pointerId,
    x: 200,
    y: 200,
    eligible: true,
    viewportWidth: 400,
    ...overrides,
  })
}

describe('photo swipe gestures', () => {
  it('maps left to older and right to newer without imposing collection bounds', () => {
    const gesture = new PhotoSwipeGesture()
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 100, y: 202 })).toBe(1)
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 300, y: 202 })).toBe(-1)
    expect(gesture.pointerUp(1, { x: 300, y: 202 })).toBeNull()
  })

  it('requires at least 48 pixels and clear horizontal intent', () => {
    const gesture = new PhotoSwipeGesture()
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 153, y: 200 })).toBeNull()
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 152, y: 200 })).toBe(1)
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 150, y: 245 })).toBeNull()
  })

  it('never turns a vertical scroll into a swipe when the finger changes direction', () => {
    const gesture = new PhotoSwipeGesture()
    begin(gesture)
    gesture.pointerMove(1, { x: 203, y: 220 })
    gesture.pointerMove(1, { x: 100, y: 220 })
    expect(gesture.pointerUp(1, { x: 90, y: 220 })).toBeNull()
  })

  it('cancels the whole gesture when a second finger lands, even outside the photo', () => {
    const gesture = new PhotoSwipeGesture()
    begin(gesture)
    begin(gesture, 2, { eligible: false })
    gesture.pointerCancel(2)
    expect(gesture.pointerUp(1, { x: 100, y: 200 })).toBeNull()
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 100, y: 200 })).toBe(1)
  })

  it('cannot start with a second finger while the first is outside the photo', () => {
    const gesture = new PhotoSwipeGesture()
    begin(gesture, 1, { eligible: false })
    begin(gesture, 2)
    gesture.pointerCancel(1)
    expect(gesture.pointerUp(2, { x: 100, y: 200 })).toBeNull()
  })

  it('preserves native edge gestures and panning an already pinched viewport', () => {
    for (const overrides of [
      { x: 24 },
      { x: 376 },
      { viewportScale: 1.5 },
      { eligible: false },
    ]) {
      const gesture = new PhotoSwipeGesture()
      begin(gesture, 1, overrides)
      expect(gesture.pointerUp(1, { x: 100, y: 200 })).toBeNull()
    }
  })

  it('ignores canceled pointers and resets cleanly when disabled', () => {
    const gesture = new PhotoSwipeGesture()
    begin(gesture)
    gesture.pointerCancel(1)
    expect(gesture.pointerUp(1, { x: 100, y: 200 })).toBeNull()
    begin(gesture)
    gesture.reset()
    expect(gesture.pointerUp(1, { x: 100, y: 200 })).toBeNull()
    begin(gesture)
    expect(gesture.pointerUp(1, { x: 100, y: 200 })).toBe(1)
  })
})
