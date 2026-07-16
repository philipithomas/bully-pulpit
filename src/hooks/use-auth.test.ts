import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reactHarness = vi.hoisted(() => ({
  effects: [] as Array<() => undefined | (() => void)>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}))

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => undefined | (() => void)) => {
    reactHarness.effects.push(effect)
  },
  useState: (initial: unknown) => {
    const setter = vi.fn()
    reactHarness.setters.push(setter)
    return [initial, setter]
  },
}))
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

import { useAuth } from '@/hooks/use-auth'

function installBrowserHarness() {
  let retryCallback: (() => void) | null = null
  const setTimeout = vi.fn((callback: () => void) => {
    retryCallback = callback
    return 1
  })
  const clearTimeout = vi.fn()
  vi.stubGlobal('document', {
    cookie: '__Host-bp_has_session=1',
    documentElement: { removeAttribute: vi.fn() },
  })
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  return {
    setTimeout,
    clearTimeout,
    retry: () => retryCallback?.(),
  }
}

function runAuthEffect() {
  // biome-ignore lint/correctness/useHookAtTopLevel: React hooks are replaced by this unit-test harness
  useAuth()
  expect(reactHarness.effects).toHaveLength(1)
  return reactHarness.effects[0]()
}

beforeEach(() => {
  reactHarness.effects.length = 0
  reactHarness.setters.length = 0
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAuth session resolution', () => {
  it('preserves the member hint and unresolved state on a 503', async () => {
    const browser = installBrowserHarness()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'Authentication is temporarily unavailable' },
          { status: 503 }
        )
      )
    )

    const cleanup = runAuthEffect()
    await vi.waitFor(() => expect(browser.setTimeout).toHaveBeenCalledOnce())

    const [setUser, setPreferences, setHasSession, setLoading, setOnboarding] =
      reactHarness.setters
    expect(setUser).not.toHaveBeenCalled()
    expect(setPreferences).not.toHaveBeenCalled()
    expect(setOnboarding).not.toHaveBeenCalled()
    expect(setHasSession).toHaveBeenCalledWith(true)
    expect(setHasSession).not.toHaveBeenCalledWith(false)
    expect(setLoading).toHaveBeenCalledWith(true)
    expect(setLoading).not.toHaveBeenCalledWith(false)
    expect(browser.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2_000)
    cleanup?.()
    expect(browser.clearTimeout).toHaveBeenCalledWith(1)
  })

  it('still clears the member hint for a successful anonymous payload', async () => {
    const browser = installBrowserHarness()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          user: null,
          preferences: null,
          newSubscriberOnboarding: false,
        })
      )
    )

    runAuthEffect()
    const [setUser, setPreferences, setHasSession, setLoading, setOnboarding] =
      reactHarness.setters
    await vi.waitFor(() => expect(setLoading).toHaveBeenCalledWith(false))

    expect(setUser).toHaveBeenCalledWith(null)
    expect(setPreferences).toHaveBeenCalledWith(null)
    expect(setOnboarding).toHaveBeenCalledWith(false)
    expect(setHasSession).toHaveBeenLastCalledWith(false)
    expect(browser.setTimeout).not.toHaveBeenCalled()
  })

  it('recovers the signed-in state when a retry succeeds', async () => {
    const browser = installBrowserHarness()
    const user = {
      uuid: '00000000-0000-4000-8000-000000000001',
      email: 'reader@example.com',
      name: 'Reader',
      isAdmin: false,
    }
    const preferences = {
      email: user.email,
      subscribed_contraption: true,
      subscribed_workshop: false,
      subscribed_postcard: true,
      subscribed_umami: true,
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          user,
          preferences,
          newSubscriberOnboarding: false,
        })
      )
    vi.stubGlobal('fetch', fetcher)

    runAuthEffect()
    await vi.waitFor(() => expect(browser.setTimeout).toHaveBeenCalledOnce())
    browser.retry()
    const [setUser, setPreferences, setHasSession, setLoading] =
      reactHarness.setters
    await vi.waitFor(() => expect(setUser).toHaveBeenCalledWith(user))

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(setPreferences).toHaveBeenCalledWith(preferences)
    expect(setHasSession).toHaveBeenLastCalledWith(true)
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })
})
