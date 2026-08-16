import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

interface PolicyApi {
  isPublicDocumentRequest(request: Request, url: URL): boolean
  isPublicDocumentUrl(url: URL): boolean
  isRouterPayloadRequest(request: Request, url: URL): boolean
  isSensitivePath(pathname: string): boolean
  normalizePathname(pathname: string): string
  responseAllowsStorage(
    response: Response,
    expectedContentType?: string
  ): boolean
  staticAssetUrlsFromHtml(html: string): string[]
}

const TEST_ORIGIN = 'https://www.philipithomas.com'

class WorkerRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' ? new URL(input, TEST_ORIGIN) : input, init)
  }
}

function cacheKey(input: Request | string): string {
  return new URL(typeof input === 'string' ? input : input.url, TEST_ORIGIN)
    .href
}

class MemoryCache {
  private readonly entries = new Map<string, Response>()

  constructor(
    private readonly fetcher: (
      input: Request | string
    ) => Promise<Response | undefined>
  ) {}

  async addAll(inputs: Array<Request | string>): Promise<void> {
    const responses = await Promise.all(
      inputs.map((input) => this.fetcher(input))
    )
    if (responses.some((response) => !response?.ok)) {
      throw new TypeError('Cache.addAll received an unsuccessful response')
    }
    await Promise.all(
      inputs.map((input, index) =>
        this.put(input, responses[index] as Response)
      )
    )
  }

  async delete(input: Request | string): Promise<boolean> {
    return this.entries.delete(cacheKey(input))
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url))
  }

  async match(input: Request | string): Promise<Response | undefined> {
    return this.entries.get(cacheKey(input))?.clone()
  }

  async put(input: Request | string, response: Response): Promise<void> {
    this.entries.set(cacheKey(input), response.clone())
  }
}

class MemoryCacheStorage {
  private readonly stores = new Map<string, MemoryCache>()

  constructor(
    private readonly fetcher: (
      input: Request | string
    ) => Promise<Response | undefined>
  ) {}

  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name)
  }

  async keys(): Promise<string[]> {
    return [...this.stores.keys()]
  }

  async match(
    input: Request | string,
    options?: { cacheName?: string }
  ): Promise<Response | undefined> {
    if (options?.cacheName) {
      return this.stores.get(options.cacheName)?.match(input)
    }
    for (const cache of this.stores.values()) {
      const response = await cache.match(input)
      if (response) return response
    }
    return undefined
  }

  async open(name: string): Promise<MemoryCache> {
    const cache = this.stores.get(name) ?? new MemoryCache(this.fetcher)
    this.stores.set(name, cache)
    return cache
  }
}

function requestLike(mode: RequestMode, headers: HeadersInit = {}): Request {
  return {
    mode,
    headers: new Headers(headers),
  } as Request
}

function loadWorker(fetcher = vi.fn()) {
  const listeners = new Map<string, (event: unknown) => void>()
  const cacheStorage = new MemoryCacheStorage(fetcher)
  const worker = {
    __PWA_TEST__: true,
    __PWA_TEST_API__: undefined as PolicyApi | undefined,
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, listener)
    },
    clients: { claim: vi.fn() },
    location: { origin: TEST_ORIGIN },
    registration: {
      navigationPreload: { enable: vi.fn().mockResolvedValue(undefined) },
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
  }
  const source = readFileSync('public/sw.js', 'utf8')

  runInNewContext(source, {
    Headers,
    Request: WorkerRequest,
    Response,
    URL,
    caches: cacheStorage,
    fetch: fetcher,
    self: worker,
  })

  if (!worker.__PWA_TEST_API__) {
    throw new Error('Service worker test API was not initialized')
  }
  return {
    api: worker.__PWA_TEST_API__,
    cacheStorage,
    fetcher,
    listeners,
    source,
    worker,
  }
}

async function navigate(
  listeners: Map<string, (event: unknown) => void>,
  path: string
): Promise<Response> {
  let responsePromise: Promise<Response> | undefined
  const backgroundWork: Promise<unknown>[] = []
  const request = {
    destination: 'document',
    headers: new Headers(),
    method: 'GET',
    mode: 'navigate',
    url: new URL(path, TEST_ORIGIN).href,
  } as Request
  const event = {
    preloadResponse: Promise.resolve(undefined),
    request,
    respondWith(response: Promise<Response>) {
      responsePromise = response
    },
    waitUntil(promise: Promise<unknown>) {
      backgroundWork.push(promise)
    },
  }

  listeners.get('fetch')?.(event)
  if (!responsePromise) throw new Error('Worker did not handle navigation')
  const response = await responsePromise
  await Promise.all(backgroundWork)
  return response
}

async function fetchResource(
  listeners: Map<string, (event: unknown) => void>,
  path: string,
  destination: RequestDestination
): Promise<Response> {
  let responsePromise: Promise<Response> | undefined
  const request = {
    destination,
    headers: new Headers(),
    method: 'GET',
    mode: 'same-origin',
    url: new URL(path, TEST_ORIGIN).href,
  } as Request
  const event = {
    request,
    respondWith(response: Promise<Response>) {
      responsePromise = response
    },
    waitUntil: vi.fn(),
  }

  listeners.get('fetch')?.(event)
  if (!responsePromise) throw new Error('Worker did not handle resource')
  return responsePromise
}

async function sendMessage(
  listeners: Map<string, (event: unknown) => void>,
  data: unknown
): Promise<void> {
  let work: Promise<unknown> | undefined
  listeners.get('message')?.({
    data,
    waitUntil(promise: Promise<unknown>) {
      work = promise
    },
  })
  await work
}

async function dispatchExtendableEvent(
  listeners: Map<string, (event: unknown) => void>,
  type: 'activate' | 'install'
): Promise<void> {
  const work: Promise<unknown>[] = []
  listeners.get(type)?.({
    waitUntil(promise: Promise<unknown>) {
      work.push(promise)
    },
  })
  await Promise.all(work)
}

describe('service worker cache policy', () => {
  it('loads as JavaScript and registers the complete lifecycle', () => {
    const { listeners } = loadWorker()
    expect([...listeners.keys()].sort()).toEqual([
      'activate',
      'fetch',
      'install',
      'message',
    ])
  })

  it('atomically installs the complete offline shell and warms the home shell', async () => {
    const fetcher = vi.fn(async (input: Request | string) => {
      const url = new URL(typeof input === 'string' ? input : input.url)
      if (url.pathname === '/') {
        return new Response(
          '<link href="/_next/static/app.css"><script src="/_next/static/app.js"></script>',
          {
            headers: {
              'Cache-Control': 'public, max-age=0, must-revalidate',
              'Content-Type': 'text/html; charset=utf-8',
            },
          }
        )
      }
      if (url.pathname.endsWith('.css')) {
        return new Response('body {}', {
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'text/css',
          },
        })
      }
      if (url.pathname.endsWith('.js')) {
        return new Response('export {}', {
          headers: {
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Content-Type': 'application/javascript',
          },
        })
      }
      return new Response('image', {
        headers: {
          'Cache-Control': 'public, max-age=86400',
          'Content-Type': 'image/png',
        },
      })
    })
    const { cacheStorage, listeners } = loadWorker(fetcher)

    await dispatchExtendableEvent(listeners, 'install')

    const shellCache = await cacheStorage.open('philipithomas-pwa-shell-v1')
    const pageCache = await cacheStorage.open('philipithomas-pwa-pages-v1')
    const staticCache = await cacheStorage.open('philipithomas-pwa-static-v1')
    expect(await shellCache.keys()).toHaveLength(5)
    expect(await pageCache.match('/')).toBeDefined()
    expect(await staticCache.keys()).toHaveLength(2)
  })

  it('does not install a partial offline shell when a core asset fails', async () => {
    const fetcher = vi.fn(async (input: Request | string) => {
      const url = new URL(typeof input === 'string' ? input : input.url)
      return new Response(url.pathname === '/offline.css' ? 'missing' : 'ok', {
        status: url.pathname === '/offline.css' ? 404 : 200,
      })
    })
    const { cacheStorage, listeners } = loadWorker(fetcher)

    await expect(dispatchExtendableEvent(listeners, 'install')).rejects.toThrow(
      'unsuccessful response'
    )
    const shellCache = await cacheStorage.open('philipithomas-pwa-shell-v1')
    expect(await shellCache.keys()).toHaveLength(0)
  })

  it('activates only its own current cache generation', async () => {
    const { cacheStorage, listeners, worker } = loadWorker()
    await cacheStorage.open('philipithomas-pwa-pages-v0')
    await cacheStorage.open('another-app-cache')

    await dispatchExtendableEvent(listeners, 'activate')

    expect(await cacheStorage.keys()).toEqual(['another-app-cache'])
    expect(worker.registration.navigationPreload.enable).toHaveBeenCalledOnce()
    expect(worker.clients.claim).toHaveBeenCalledOnce()
  })

  it.each([
    '/account',
    '/account/preferences',
    '/ACCOUNT/',
    '/%61ccount',
    '/unsubscribe',
    '/auth/verify',
    '/api/search',
    '/admin',
    '/printing-press/posts',
    '/mcp',
    '/offline.html',
    '/unsubscribe/confirm',
    '/bell.vcf',
  ])('excludes sensitive path %s', (pathname) => {
    expect(loadWorker().api.isSensitivePath(pathname)).toBe(true)
  })

  it.each([
    '/mcp/setup',
    '/postcard',
    '/photography',
    '/some-post',
  ])('allows public path %s', (pathname) => {
    expect(loadWorker().api.isSensitivePath(pathname)).toBe(false)
  })

  it('only admits query-free, same-origin document navigations', () => {
    const { api } = loadWorker()
    const documentRequest = requestLike('navigate')

    expect(
      api.isPublicDocumentRequest(
        documentRequest,
        new URL('https://www.philipithomas.com/a-post')
      )
    ).toBe(true)
    expect(
      api.isPublicDocumentRequest(
        documentRequest,
        new URL('https://www.philipithomas.com/a-post?token=sentinel')
      )
    ).toBe(false)
    expect(
      api.isPublicDocumentRequest(
        documentRequest,
        new URL('https://example.com/a-post')
      )
    ).toBe(false)
    expect(
      api.isPublicDocumentRequest(
        requestLike('cors'),
        new URL('https://www.philipithomas.com/a-post')
      )
    ).toBe(false)
  })

  it('recognizes every Next router payload marker', () => {
    const { api } = loadWorker()
    const baseUrl = new URL('https://www.philipithomas.com/a-post')

    for (const header of [
      'RSC',
      'Next-Router-Prefetch',
      'Next-Router-State-Tree',
    ]) {
      expect(
        api.isRouterPayloadRequest(
          requestLike('cors', { [header]: '1' }),
          baseUrl
        )
      ).toBe(true)
    }
    expect(
      api.isRouterPayloadRequest(
        requestLike('cors'),
        new URL('https://www.philipithomas.com/a-post?_rsc=abc')
      )
    ).toBe(true)
  })

  it('rejects private, partial, redirected, personalized, and wrong-type responses', () => {
    const { api } = loadWorker()
    const html = {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Content-Type': 'text/html; charset=utf-8',
    }
    const redirected = new Response('redirected', { headers: html })
    Object.defineProperty(redirected, 'redirected', { value: true })

    expect(
      api.responseAllowsStorage(
        new Response('ok', { headers: html }),
        'text/html'
      )
    ).toBe(true)
    expect(
      api.responseAllowsStorage(
        new Response('private', {
          headers: { ...html, 'Cache-Control': 'private, no-store' },
        }),
        'text/html'
      )
    ).toBe(false)
    expect(
      api.responseAllowsStorage(
        new Response('unclassified', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
        'text/html'
      )
    ).toBe(false)
    expect(api.responseAllowsStorage(redirected, 'text/html')).toBe(false)
    expect(
      api.responseAllowsStorage(
        new Response('cookie', {
          headers: { ...html, 'Set-Cookie': 'private=1' },
        }),
        'text/html'
      )
    ).toBe(false)
    expect(
      api.responseAllowsStorage(
        new Response('personalized', {
          headers: { ...html, Vary: 'Accept-Encoding, Cookie' },
        }),
        'text/html'
      )
    ).toBe(false)
    expect(
      api.responseAllowsStorage(
        new Response('partial', {
          status: 206,
          headers: { ...html, 'Content-Range': 'bytes 0-6/12' },
        }),
        'text/html'
      )
    ).toBe(false)
    expect(
      api.responseAllowsStorage(
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
        'text/html'
      )
    ).toBe(false)
  })

  it('discovers only same-origin hashed Next assets from the home shell', () => {
    const { api } = loadWorker()
    expect(
      api.staticAssetUrlsFromHtml(`
        <link href="/_next/static/app.css">
        <script src="https://www.philipithomas.com/_next/static/app.js"></script>
        <img src="/images/portrait.jpg">
        <script src="https://example.com/_next/static/foreign.js"></script>
      `)
    ).toEqual([
      'https://www.philipithomas.com/_next/static/app.css',
      'https://www.philipithomas.com/_next/static/app.js',
    ])
  })

  it('serves visited documents before the branded fallback when offline', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    const { cacheStorage, listeners } = loadWorker(fetcher)
    const shellCache = await cacheStorage.open('philipithomas-pwa-shell-v1')
    const pageCache = await cacheStorage.open('philipithomas-pwa-pages-v1')
    await shellCache.put(
      '/offline.html',
      new Response(
        '<h1>You’re offline.</h1><a href="/" data-pwa-retry>Try again</a>',
        {
          headers: { 'Content-Type': 'text/html' },
        }
      )
    )
    await pageCache.put(
      '/visited',
      new Response('<h1>Visited page</h1>', {
        headers: { 'Content-Type': 'text/html' },
      })
    )

    expect(await (await navigate(listeners, '/visited')).text()).toContain(
      'Visited page'
    )
    const fallback = await navigate(listeners, '/never-seen?one=1&two=2')
    const fallbackHtml = await fallback.text()
    expect(fallback.status).toBe(503)
    expect(fallbackHtml).toContain('You’re offline.')
    expect(fallbackHtml).toContain(
      'href="/never-seen?one=1&amp;two=2" data-pwa-retry'
    )
  })

  it('serves every offline-shell dependency from the shell cache', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    const { cacheStorage, listeners } = loadWorker(fetcher)
    const shellCache = await cacheStorage.open('philipithomas-pwa-shell-v1')
    await shellCache.put(
      '/offline.css',
      new Response('body { color: black; }', {
        headers: { 'Content-Type': 'text/css' },
      })
    )
    await shellCache.put(
      '/icon.svg',
      new Response('<svg></svg>', {
        headers: { 'Content-Type': 'image/svg+xml' },
      })
    )

    expect(
      await (await fetchResource(listeners, '/offline.css', 'style')).text()
    ).toContain('color: black')
    expect(
      await (await fetchResource(listeners, '/icon.svg', 'image')).text()
    ).toContain('<svg>')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('stores a successful public document for a later offline reload', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('<h1>Fresh public page</h1>', {
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    )
    const { cacheStorage, listeners } = loadWorker(fetcher)
    const shellCache = await cacheStorage.open('philipithomas-pwa-shell-v1')
    await shellCache.put('/offline.html', new Response('offline'))

    expect(await (await navigate(listeners, '/fresh')).text()).toContain(
      'Fresh public page'
    )
    fetcher.mockRejectedValue(new Error('offline'))
    expect(await (await navigate(listeners, '/fresh')).text()).toContain(
      'Fresh public page'
    )
  })

  it('warms a query-free public document after a client-side transition', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('<h1>Visited through Next Link</h1>', {
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    )
    const { cacheStorage, listeners } = loadWorker(fetcher)

    await sendMessage(listeners, {
      type: 'CACHE_PUBLIC_PAGE',
      path: '/visited-via-link',
    })
    await sendMessage(listeners, {
      type: 'CACHE_PUBLIC_PAGE',
      path: '/account',
    })
    await sendMessage(listeners, {
      type: 'CACHE_PUBLIC_PAGE',
      path: '/unsubscribe?token=sentinel',
    })
    await sendMessage(listeners, {
      type: 'CACHE_PUBLIC_PAGE',
      path: 'https://example.com/foreign',
    })

    const pageCache = await cacheStorage.open('philipithomas-pwa-pages-v1')
    expect(
      await (await pageCache.match('/visited-via-link'))?.text()
    ).toContain('Visited through Next Link')
    expect(await pageCache.keys()).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher.mock.calls[0][0]).toMatchObject({ credentials: 'omit' })
  })

  it('bounds the visited-page cache and evicts its oldest entry', async () => {
    const fetcher = vi.fn(async (input: Request) => {
      const url = new URL(input.url)
      return new Response(`<h1>${url.pathname}</h1>`, {
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    })
    const { cacheStorage, listeners } = loadWorker(fetcher)

    for (let index = 0; index < 33; index += 1) {
      await navigate(listeners, `/page-${index}`)
    }

    const pageCache = await cacheStorage.open('philipithomas-pwa-pages-v1')
    expect(await pageCache.keys()).toHaveLength(32)
    expect(await pageCache.match('/page-0')).toBeUndefined()
    expect(await pageCache.match('/page-32')).toBeDefined()
  })

  it('never stores sensitive or query-bearing document navigations', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response('<h1>Network response</h1>', {
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    )
    const { cacheStorage, listeners } = loadWorker(fetcher)

    await navigate(listeners, '/account')
    await navigate(listeners, '/unsubscribe?token=sentinel')

    const pageCache = await cacheStorage.open('philipithomas-pwa-pages-v1')
    expect(await pageCache.keys()).toHaveLength(0)
  })
})
