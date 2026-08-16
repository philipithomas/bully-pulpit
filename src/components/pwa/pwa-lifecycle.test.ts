import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reactHarness = vi.hoisted(() => ({
  effects: [] as Array<() => undefined | (() => void)>,
}))
const toastHarness = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
  })
  return { toast }
})

vi.mock('react', () => ({
  useEffect: (effect: () => undefined | (() => void)) => {
    reactHarness.effects.push(effect)
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/visited-via-link',
}))
vi.mock('sonner', () => ({ toast: toastHarness.toast }))

interface EventHub {
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatch(type: string, event?: unknown): void
}

function eventHub(): EventHub {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  return {
    addEventListener: vi.fn(
      (type: string, listener: (event: unknown) => void) => {
        const existing = listeners.get(type) ?? new Set()
        existing.add(listener)
        listeners.set(type, existing)
      }
    ),
    removeEventListener: vi.fn(
      (type: string, listener: (event: unknown) => void) => {
        listeners.get(type)?.delete(listener)
      }
    ),
    dispatch(type: string, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
}

function installBrowserHarness(options?: {
  controlled?: boolean
  failFirstRegistration?: boolean
  installing?: boolean
  waiting?: boolean
}) {
  const serviceWorkerEvents = eventHub()
  const registrationEvents = eventHub()
  const windowEvents = eventHub()
  const documentEvents = eventHub()
  const active = { postMessage: vi.fn() }
  const waiting = options?.waiting ? { postMessage: vi.fn() } : null
  const installingEvents = eventHub()
  const installing = options?.installing
    ? {
        ...installingEvents,
        postMessage: vi.fn(),
        state: 'installing',
      }
    : null
  const registration = {
    ...registrationEvents,
    active,
    installing,
    waiting,
    update: vi.fn().mockResolvedValue(undefined),
  }
  const register = vi.fn().mockResolvedValue(registration)
  if (options?.failFirstRegistration) {
    register.mockRejectedValueOnce(new Error('temporarily unavailable'))
  }
  const serviceWorker = {
    ...serviceWorkerEvents,
    controller: options?.controlled ? {} : null,
    ready: Promise.resolve(registration),
    register,
  }
  const reload = vi.fn()
  const assign = vi.fn()

  vi.stubGlobal('navigator', { onLine: true, serviceWorker })
  vi.stubGlobal('window', {
    ...windowEvents,
    cancelIdleCallback: vi.fn(),
    location: {
      assign,
      href: 'https://www.philipithomas.com/',
      origin: 'https://www.philipithomas.com',
      pathname: '/',
      reload,
      search: '',
    },
    requestIdleCallback: vi.fn((callback: () => void) => {
      callback()
      return 1
    }),
  })
  vi.stubGlobal('document', {
    ...documentEvents,
    readyState: 'complete',
    visibilityState: 'visible',
  })

  return {
    active,
    assign,
    documentEvents,
    installing,
    installingEvents,
    registration,
    reload,
    serviceWorker,
    serviceWorkerEvents,
    waiting,
    windowEvents,
  }
}

async function runLifecycleEffects() {
  const { PwaLifecycle } = await import('@/components/pwa/pwa-lifecycle')
  PwaLifecycle()
  expect(reactHarness.effects).toHaveLength(2)
  return reactHarness.effects.map((effect) => effect())
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'production')
  reactHarness.effects.length = 0
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('PWA lifecycle', () => {
  it('registers once with a stable root scope and bypasses HTTP cache updates', async () => {
    const browser = installBrowserHarness()
    const [cleanupLifecycle, cleanupWarmPage] = await runLifecycleEffects()

    await vi.waitFor(() =>
      expect(browser.serviceWorker.register).toHaveBeenCalled()
    )
    expect(browser.serviceWorker.register).toHaveBeenCalledWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
    expect(browser.registration.update).toHaveBeenCalledOnce()
    expect(browser.active.postMessage).toHaveBeenCalledWith({
      type: 'REFRESH_OFFLINE_CACHE',
    })
    expect(browser.active.postMessage).toHaveBeenCalledWith({
      type: 'CACHE_PUBLIC_PAGE',
      path: '/visited-via-link',
    })

    cleanupLifecycle?.()
    cleanupWarmPage?.()
    expect(browser.serviceWorker.removeEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function)
    )
  })

  it('activates an update only after the visitor chooses Reload', async () => {
    const browser = installBrowserHarness({ controlled: true, waiting: true })
    await runLifecycleEffects()

    await vi.waitFor(() => expect(toastHarness.toast).toHaveBeenCalled())
    const options = toastHarness.toast.mock.calls[0][1] as {
      action: { onClick(): void }
    }
    options.action.onClick()

    expect(browser.waiting?.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    })
    expect(browser.reload).not.toHaveBeenCalled()

    browser.serviceWorkerEvents.dispatch('controllerchange')
    expect(browser.reload).toHaveBeenCalledOnce()
  })

  it('observes an update that was already installing at registration time', async () => {
    const browser = installBrowserHarness({
      controlled: true,
      installing: true,
    })
    await runLifecycleEffects()
    await vi.waitFor(() =>
      expect(browser.serviceWorker.register).toHaveBeenCalledOnce()
    )
    expect(toastHarness.toast).not.toHaveBeenCalled()

    if (!browser.installing) throw new Error('Installing worker is missing')
    browser.installing.state = 'installed'
    browser.installingEvents.dispatch('statechange')

    expect(toastHarness.toast).toHaveBeenCalledWith(
      'A site update is ready.',
      expect.objectContaining({ id: 'pwa-update' })
    )
  })

  it('retries a transient registration failure after reconnecting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const browser = installBrowserHarness({ failFirstRegistration: true })
    await runLifecycleEffects()

    await vi.waitFor(() =>
      expect(browser.serviceWorker.register).toHaveBeenCalledOnce()
    )
    browser.windowEvents.dispatch('online')
    await vi.waitFor(() =>
      expect(browser.serviceWorker.register).toHaveBeenCalledTimes(2)
    )
    expect(warn).toHaveBeenCalledWith(
      '[pwa] Service worker registration failed',
      expect.any(Error)
    )
  })

  it('uses a document navigation for an internal link while offline', async () => {
    class LinkTarget {
      closest() {
        return {
          hasAttribute: () => false,
          href: 'https://www.philipithomas.com/visited-post',
          target: '',
        }
      }
    }
    vi.stubGlobal('Element', LinkTarget)
    const browser = installBrowserHarness()
    await runLifecycleEffects()
    ;(navigator as Navigator & { onLine: boolean }).onLine = false
    const preventDefault = vi.fn()

    browser.documentEvents.dispatch('click', {
      altKey: false,
      button: 0,
      ctrlKey: false,
      defaultPrevented: false,
      metaKey: false,
      preventDefault,
      shiftKey: false,
      target: new LinkTarget(),
    })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(browser.assign).toHaveBeenCalledWith(
      'https://www.philipithomas.com/visited-post'
    )
  })

  it('warms a route only once during the current app session', async () => {
    const browser = installBrowserHarness()
    await runLifecycleEffects()
    await vi.waitFor(() =>
      expect(browser.active.postMessage).toHaveBeenCalledWith({
        type: 'CACHE_PUBLIC_PAGE',
        path: '/visited-via-link',
      })
    )

    reactHarness.effects.length = 0
    const { PwaLifecycle } = await import('@/components/pwa/pwa-lifecycle')
    PwaLifecycle()
    expect(reactHarness.effects).toHaveLength(2)
    reactHarness.effects[1]()

    const pageWarmMessages = browser.active.postMessage.mock.calls.filter(
      ([message]) => message.type === 'CACHE_PUBLIC_PAGE'
    )
    expect(pageWarmMessages).toHaveLength(1)
  })

  it('does nothing when service workers are unsupported', async () => {
    vi.stubGlobal('navigator', {})
    const cleanups = await runLifecycleEffects()
    expect(cleanups).toEqual([undefined, undefined])
  })
})
