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

class TestMessagePort {
  onmessage: ((event: { data: unknown }) => void) | null = null
  peer: TestMessagePort | null = null
  close = vi.fn()

  postMessage(data: unknown) {
    this.peer?.onmessage?.({ data })
  }
}

class TestMessageChannel {
  port1 = new TestMessagePort()
  port2 = new TestMessagePort()

  constructor() {
    this.port1.peer = this.port2
    this.port2.peer = this.port1
  }
}

function installBrowserHarness(options?: {
  cacheNames?: string[]
  controlled?: boolean
  failFirstRegistration?: boolean
  installing?: boolean
  waiting?: boolean
  warmSucceeds?: boolean
}) {
  const serviceWorkerEvents = eventHub()
  const registrationEvents = eventHub()
  const windowEvents = eventHub()
  const documentEvents = eventHub()
  const active = {
    postMessage: vi.fn(
      (
        message: { path?: string; type?: string },
        ports?: TestMessagePort[]
      ) => {
        if (message.type !== 'CACHE_PUBLIC_PAGE' || !ports?.[0]) return
        ports[0].postMessage({
          type: 'CACHE_PUBLIC_PAGE_RESULT',
          path: message.path,
          cached: options?.warmSucceeds !== false,
        })
      }
    ),
  }
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
    unregister: vi.fn().mockResolvedValue(true),
  }
  const register = vi.fn().mockResolvedValue(registration)
  if (options?.failFirstRegistration) {
    register.mockRejectedValueOnce(new Error('temporarily unavailable'))
  }
  const serviceWorker = {
    ...serviceWorkerEvents,
    controller: options?.controlled ? {} : null,
    getRegistration: vi.fn().mockResolvedValue(registration),
    ready: Promise.resolve(registration),
    register,
  }
  const reload = vi.fn()
  const assign = vi.fn()
  const cacheStorage = {
    delete: vi.fn().mockResolvedValue(true),
    keys: vi
      .fn()
      .mockResolvedValue(
        options?.cacheNames ?? ['philipithomas-pwa-pages-v1', 'other-cache']
      ),
  }

  vi.stubGlobal('navigator', { onLine: true, serviceWorker })
  vi.stubGlobal('MessageChannel', TestMessageChannel)
  vi.stubGlobal('window', {
    ...windowEvents,
    caches: cacheStorage,
    cancelIdleCallback: vi.fn(),
    clearTimeout: globalThis.clearTimeout,
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
    setTimeout: globalThis.setTimeout,
  })
  vi.stubGlobal('document', {
    ...documentEvents,
    readyState: 'complete',
    visibilityState: 'visible',
  })

  return {
    active,
    assign,
    cacheStorage,
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
    expect(browser.active.postMessage).toHaveBeenCalledWith(
      {
        type: 'CACHE_PUBLIC_PAGE',
        path: '/visited-via-link',
      },
      [expect.any(TestMessagePort)]
    )

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

  it('reloads a sibling tab when another tab activates an update', async () => {
    const browser = installBrowserHarness({ controlled: true })
    await runLifecycleEffects()

    browser.serviceWorkerEvents.dispatch('controllerchange')

    expect(browser.reload).toHaveBeenCalledOnce()
  })

  it('does not reload after the first service worker installation', async () => {
    const browser = installBrowserHarness()
    await runLifecycleEffects()

    browser.serviceWorkerEvents.dispatch('controllerchange')

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
      expect(browser.active.postMessage).toHaveBeenCalledWith(
        {
          type: 'CACHE_PUBLIC_PAGE',
          path: '/visited-via-link',
        },
        [expect.any(TestMessagePort)]
      )
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

  it('retries warming a route when the worker reports failure', async () => {
    const browser = installBrowserHarness({ warmSucceeds: false })
    await runLifecycleEffects()
    await vi.waitFor(() =>
      expect(
        browser.active.postMessage.mock.calls.filter(
          ([message]) => message.type === 'CACHE_PUBLIC_PAGE'
        )
      ).toHaveLength(1)
    )

    reactHarness.effects.length = 0
    const { PwaLifecycle } = await import('@/components/pwa/pwa-lifecycle')
    PwaLifecycle()
    reactHarness.effects[1]()

    await vi.waitFor(() => {
      const pageWarmMessages = browser.active.postMessage.mock.calls.filter(
        ([message]) => message.type === 'CACHE_PUBLIC_PAGE'
      )
      expect(pageWarmMessages).toHaveLength(2)
    })
  })

  it('unregisters the production worker and clears its caches in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const browser = installBrowserHarness()
    await runLifecycleEffects()

    await vi.waitFor(() => {
      expect(browser.registration.unregister).toHaveBeenCalledOnce()
      expect(browser.cacheStorage.delete).toHaveBeenCalledOnce()
    })
    expect(browser.serviceWorker.register).not.toHaveBeenCalled()
    expect(browser.cacheStorage.delete).toHaveBeenCalledWith(
      'philipithomas-pwa-pages-v1'
    )
    expect(browser.cacheStorage.delete).not.toHaveBeenCalledWith('other-cache')
  })

  it('does nothing when service workers are unsupported', async () => {
    vi.stubGlobal('navigator', {})
    const cleanups = await runLifecycleEffects()
    expect(cleanups).toEqual([undefined, undefined])
  })
})
