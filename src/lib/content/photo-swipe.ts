export type PhotoSwipeDirection = -1 | 1

interface Point {
  x: number
  y: number
}

interface SwipeStart extends Point {
  pointerId: number
  eligible: boolean
  viewportWidth: number
  viewportScale?: number
}

/** Single-touch navigation that yields to vertical scroll, pinch, and OS edges. */
export class PhotoSwipeGesture {
  private touches = new Set<number>()
  private start: (Point & { pointerId: number }) | null = null

  pointerDown(input: SwipeStart): void {
    this.touches.add(input.pointerId)
    if (this.touches.size !== 1) {
      this.start = null
      return
    }
    if (
      !input.eligible ||
      input.x <= 24 ||
      input.x >= input.viewportWidth - 24 ||
      (input.viewportScale ?? 1) > 1
    ) {
      return
    }
    this.start = { pointerId: input.pointerId, x: input.x, y: input.y }
  }

  pointerMove(pointerId: number, point: Point): void {
    if (this.start?.pointerId !== pointerId) return
    const x = Math.abs(point.x - this.start.x)
    const y = Math.abs(point.y - this.start.y)
    if (y >= 12 && y > x) this.start = null
  }

  pointerUp(pointerId: number, point: Point): PhotoSwipeDirection | null {
    const start = this.start
    const singleTouch = this.touches.size === 1
    this.pointerCancel(pointerId)
    if (!start || start.pointerId !== pointerId || !singleTouch) return null
    const x = point.x - start.x
    const y = point.y - start.y
    if (Math.abs(x) < 48 || Math.abs(x) < Math.abs(y) * 1.25) return null
    return x < 0 ? 1 : -1
  }

  pointerCancel(pointerId: number): void {
    this.touches.delete(pointerId)
    if (this.start?.pointerId === pointerId) this.start = null
  }

  reset(): void {
    this.touches.clear()
    this.start = null
  }
}
