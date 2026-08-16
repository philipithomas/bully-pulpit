// Bump this only when the caching contract changes. Page content is
// network-first and Next assets are content-hashed, so ordinary deploys do not
// need a new cache namespace.
const CACHE_VERSION = 'v1'
const CACHE_PREFIX = 'philipithomas-pwa'
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`
const PAGE_CACHE = `${CACHE_PREFIX}-pages-${CACHE_VERSION}`
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`
const IMAGE_CACHE = `${CACHE_PREFIX}-images-${CACHE_VERSION}`
const EXPECTED_CACHES = new Set([
  SHELL_CACHE,
  PAGE_CACHE,
  STATIC_CACHE,
  IMAGE_CACHE,
])

const OFFLINE_URL = '/offline.html'
const CORE_ASSETS = [
  OFFLINE_URL,
  '/offline.css',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
]
const CORE_ASSET_PATHS = new Set(CORE_ASSETS)

const MAX_PAGE_ENTRIES = 32
const MAX_STATIC_ENTRIES = 96
const MAX_IMAGE_ENTRIES = 64

const SENSITIVE_EXACT_PATHS = new Set(['/bell.vcf', '/mcp', '/offline.html'])
const SENSITIVE_PATH_PREFIXES = [
  '/account',
  '/admin',
  '/api',
  '/auth',
  '/printing-press',
  '/unsubscribe',
]

function normalizePathname(pathname) {
  try {
    const normalized = decodeURIComponent(pathname)
      .replace(/\/{2,}/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase()
    return normalized || '/'
  } catch {
    const normalized = pathname.replace(/\/+$/, '').toLowerCase()
    return normalized || '/'
  }
}

function isSensitivePath(pathname) {
  const normalized = normalizePathname(pathname)
  if (SENSITIVE_EXACT_PATHS.has(normalized)) return true
  return SENSITIVE_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  )
}

function isRouterPayloadRequest(request, url) {
  return (
    url.searchParams.has('_rsc') ||
    request.headers.has('RSC') ||
    request.headers.has('Next-Router-Prefetch') ||
    request.headers.has('Next-Router-State-Tree')
  )
}

function isPublicDocumentRequest(request, url) {
  return (
    request.mode === 'navigate' &&
    isPublicDocumentUrl(url) &&
    !isRouterPayloadRequest(request, url)
  )
}

function isPublicDocumentUrl(url) {
  return (
    url.origin === self.location.origin &&
    url.search === '' &&
    !isSensitivePath(url.pathname)
  )
}

function responseAllowsStorage(response, expectedContentType) {
  if (
    response.status !== 200 ||
    response.redirected ||
    (response.type !== 'basic' && response.type !== 'default')
  ) {
    return false
  }

  const cacheControl = response.headers.get('Cache-Control') ?? ''
  const vary = response.headers.get('Vary') ?? ''
  if (/\b(?:no-store|private)\b/i.test(cacheControl)) return false
  // Runtime caches admit only responses that the server has deliberately
  // classified as public. Core shell assets use the separate fixed allowlist.
  if (!/(?:^|,)\s*public\b/i.test(cacheControl)) return false
  if (/\b(?:authorization|cookie)\b/i.test(vary)) return false
  if (response.headers.has('Set-Cookie')) return false
  if (response.headers.has('Content-Range')) return false

  if (!expectedContentType) return true
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!contentType.toLowerCase().includes(expectedContentType)) return false

  return true
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys()
  const excess = keys.length - maxEntries
  if (excess <= 0) return
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)))
}

async function putWithLimit(cacheName, key, response, maxEntries) {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(key, response)
    await trimCache(cache, maxEntries)
    return true
  } catch {
    // Cache Storage is best effort. Quota or private-mode failures must never
    // prevent a network response from reaching the page.
    return false
  }
}

async function refreshCoreAssets() {
  const cache = await caches.open(SHELL_CACHE)
  const requests = CORE_ASSETS.map(
    (url) => new Request(url, { cache: 'reload', credentials: 'omit' })
  )
  await cache.addAll(requests)
}

function staticAssetUrlsFromHtml(html) {
  const urls = new Set()
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const rawUrl = match[1].replaceAll('&amp;', '&')
    const url = new URL(rawUrl, self.location.origin)
    if (
      url.origin === self.location.origin &&
      url.pathname.startsWith('/_next/static/')
    ) {
      urls.add(url.href)
    }
  }
  return [...urls]
}

async function warmHomeShell() {
  const response = await fetch(
    new Request('/', { cache: 'reload', credentials: 'omit' })
  )
  if (!responseAllowsStorage(response, 'text/html')) return

  const htmlResponse = response.clone()
  const html = await response.text()
  await putWithLimit(PAGE_CACHE, '/', htmlResponse, MAX_PAGE_ENTRIES)

  const staticCache = await caches.open(STATIC_CACHE)
  await Promise.allSettled(
    staticAssetUrlsFromHtml(html).map(async (url) => {
      const assetResponse = await fetch(
        new Request(url, { cache: 'reload', credentials: 'omit' })
      )
      if (responseAllowsStorage(assetResponse)) {
        await staticCache.put(url, assetResponse)
      }
    })
  )
  await trimCache(staticCache, MAX_STATIC_ENTRIES)
}

async function cachePublicPage(path) {
  if (typeof path !== 'string') return false

  let url
  try {
    url = new URL(path, self.location.origin)
  } catch {
    return false
  }
  if (!isPublicDocumentUrl(url)) return false

  try {
    const response = await fetch(
      new Request(url.href, {
        cache: 'no-cache',
        credentials: 'omit',
        headers: { Accept: 'text/html' },
      })
    )
    if (!responseAllowsStorage(response, 'text/html')) return false
    return putWithLimit(PAGE_CACHE, url.pathname, response, MAX_PAGE_ENTRIES)
  } catch {
    return Boolean(
      await caches.match(url.pathname, {
        cacheName: PAGE_CACHE,
      })
    )
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await refreshCoreAssets()
      await warmHomeShell().catch(() => undefined)
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys()
      await Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(`${CACHE_PREFIX}-`) &&
              !EXPECTED_CACHES.has(cacheName)
          )
          .map((cacheName) => caches.delete(cacheName))
      )

      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload
          .enable()
          .catch(() => undefined)
      }
      await self.clients.claim()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
    return
  }
  if (event.data?.type === 'REFRESH_OFFLINE_CACHE') {
    event.waitUntil(refreshCoreAssets().catch(() => undefined))
    return
  }
  if (event.data?.type === 'CACHE_PUBLIC_PAGE') {
    const replyPort = event.ports?.[0]
    const reply = (cached) => {
      try {
        replyPort?.postMessage({
          type: 'CACHE_PUBLIC_PAGE_RESULT',
          path: event.data.path,
          cached,
        })
      } catch {
        // The requesting page may have closed before the cache write finished.
      }
    }
    event.waitUntil(
      cachePublicPage(event.data.path)
        .then(reply)
        .catch(() => reply(false))
    )
  }
})

async function networkNavigation(event) {
  try {
    const preloadedResponse = await event.preloadResponse
    if (preloadedResponse) return preloadedResponse
  } catch {
    // A failed preload can still be retried through the ordinary fetch path.
  }
  return fetch(event.request)
}

function escapeHtmlAttribute(value) {
  return value.replace(/[&"<>]/g, (character) => {
    if (character === '&') return '&amp;'
    if (character === '"') return '&quot;'
    if (character === '<') return '&lt;'
    return '&gt;'
  })
}

async function offlineFallback(url) {
  const offlinePage = await caches.match(OFFLINE_URL, {
    cacheName: SHELL_CACHE,
  })
  if (!offlinePage) {
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const retryUrl = escapeHtmlAttribute(
    `${url.pathname}${url.search}${url.hash}`
  )
  const html = (await offlinePage.text()).replace(
    'href="/" data-pwa-retry',
    `href="${retryUrl}" data-pwa-retry`
  )
  const headers = new Headers(offlinePage.headers)
  headers.delete('Content-Encoding')
  headers.delete('Content-Length')
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return new Response(html, { status: 503, headers })
}

async function handleNavigation(event, url) {
  const cacheableRequest = isPublicDocumentRequest(event.request, url)

  try {
    const response = await networkNavigation(event)
    if (cacheableRequest && responseAllowsStorage(response, 'text/html')) {
      event.waitUntil(
        putWithLimit(
          PAGE_CACHE,
          url.pathname,
          response.clone(),
          MAX_PAGE_ENTRIES
        )
      )
    }
    return response
  } catch {
    if (cacheableRequest) {
      const cachedPage = await caches.match(url.pathname, {
        cacheName: PAGE_CACHE,
      })
      if (cachedPage) return cachedPage
    }

    return offlineFallback(url)
  }
}

async function handleCoreAsset(request) {
  const cached = await caches.match(request, { cacheName: SHELL_CACHE })
  return cached ?? fetch(request)
}

async function handleStaticAsset(event) {
  const request = event.request
  const cached = await caches.match(request, { cacheName: STATIC_CACHE })
  if (cached) return cached

  const response = await fetch(request)
  if (responseAllowsStorage(response)) {
    event.waitUntil(
      putWithLimit(STATIC_CACHE, request, response.clone(), MAX_STATIC_ENTRIES)
    )
  }
  return response
}

async function handleImage(event) {
  const request = event.request
  const cached = await caches.match(request, { cacheName: IMAGE_CACHE })
  const networkResponse = fetch(request)

  const storeResponse = async (response) => {
    if (responseAllowsStorage(response, 'image/')) {
      await putWithLimit(
        IMAGE_CACHE,
        request,
        response.clone(),
        MAX_IMAGE_ENTRIES
      )
    }
  }

  if (cached) {
    event.waitUntil(networkResponse.then(storeResponse).catch(() => undefined))
    return cached
  }

  const response = await networkResponse
  event.waitUntil(storeResponse(response.clone()))
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event, url))
    return
  }

  if (url.search === '' && CORE_ASSET_PATHS.has(url.pathname)) {
    event.respondWith(handleCoreAsset(request))
    return
  }

  // RSC and router-prefetch requests are intentionally network-only. Their
  // response varies by router state and is not a safe document-cache key.
  if (isRouterPayloadRequest(request, url) || isSensitivePath(url.pathname)) {
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(handleStaticAsset(event))
    return
  }

  if (
    request.destination === 'image' ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname.startsWith('/images/')
  ) {
    event.respondWith(handleImage(event))
  }
})

// Unit tests opt into these pure policy helpers. The property is absent in
// browsers, so production workers expose no test-only API.
if (self.__PWA_TEST__) {
  self.__PWA_TEST_API__ = {
    isPublicDocumentRequest,
    isPublicDocumentUrl,
    isRouterPayloadRequest,
    isSensitivePath,
    normalizePathname,
    responseAllowsStorage,
    staticAssetUrlsFromHtml,
  }
}
