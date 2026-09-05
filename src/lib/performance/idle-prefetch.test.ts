import { describe, expect, it, vi } from 'vitest'
import {
  allowsIdlePrefetch,
  scheduleIdlePrefetch,
} from '@/lib/performance/idle-prefetch'

function idleTarget(connection?: {
  effectiveType?: string
  saveData?: boolean
}) {
  let idleCallback: (() => void) | undefined
  let timeoutCallback: (() => void) | undefined

  const target = {
    navigator: { connection },
    requestIdleCallback: vi.fn((callback: () => void) => {
      idleCallback = callback
      return 41
    }),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn((callback: () => void) => {
      timeoutCallback = callback
      return 42
    }),
    clearTimeout: vi.fn(),
  }

  return {
    idle: () => idleCallback?.(),
    target,
    timeout: () => timeoutCallback?.(),
  }
}

describe('idle prefetch connection policy', () => {
  it('keeps idle warming for unknown and fast connections', () => {
    expect(allowsIdlePrefetch()).toBe(true)
    expect(allowsIdlePrefetch({ effectiveType: '4g' })).toBe(true)
  })

  it.each([
    'slow-2g',
    '2g',
    '3g',
  ])('skips speculative downloads on %s connections', (effectiveType) => {
    expect(allowsIdlePrefetch({ effectiveType })).toBe(false)
  })

  it('honors the browser data-saver preference', () => {
    expect(allowsIdlePrefetch({ effectiveType: '4g', saveData: true })).toBe(
      false
    )
  })
})

describe('scheduleIdlePrefetch', () => {
  it('does not schedule work on a constrained connection', () => {
    const prefetch = vi.fn()
    const browser = idleTarget({ effectiveType: '3g' })

    scheduleIdlePrefetch(prefetch, { target: browser.target })

    expect(browser.target.requestIdleCallback).not.toHaveBeenCalled()
    expect(browser.target.setTimeout).not.toHaveBeenCalled()
    expect(prefetch).not.toHaveBeenCalled()
  })

  it('uses idle time and cancels the pending callback on cleanup', () => {
    const prefetch = vi.fn()
    const browser = idleTarget({ effectiveType: '4g' })

    const cleanup = scheduleIdlePrefetch(prefetch, {
      target: browser.target,
    })
    browser.idle()
    cleanup()

    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(browser.target.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 5000 }
    )
    expect(browser.target.cancelIdleCallback).toHaveBeenCalledWith(41)
  })

  it('rechecks the connection before a pending idle callback runs', () => {
    const prefetch = vi.fn()
    const connection = { effectiveType: '4g' }
    const browser = idleTarget(connection)

    scheduleIdlePrefetch(prefetch, { target: browser.target })
    connection.effectiveType = '2g'
    browser.idle()

    expect(prefetch).not.toHaveBeenCalled()
  })

  it('falls back to a cancellable timer when idle callbacks are unavailable', () => {
    const prefetch = vi.fn()
    const browser = idleTarget()
    const fallbackTarget = {
      navigator: browser.target.navigator,
      setTimeout: browser.target.setTimeout,
      clearTimeout: browser.target.clearTimeout,
    }

    const cleanup = scheduleIdlePrefetch(prefetch, {
      target: fallbackTarget,
    })
    browser.timeout()
    cleanup()

    expect(browser.target.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      2000
    )
    expect(prefetch).toHaveBeenCalledTimes(1)
    expect(browser.target.clearTimeout).toHaveBeenCalledWith(42)
  })
})
