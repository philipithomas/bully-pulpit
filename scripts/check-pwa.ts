/** Post-build guard for the complete install/offline PWA contract. */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Script } from 'node:vm'

const root = process.cwd()
const manifestBodyPath = join(
  root,
  '.next/server/app/manifest.webmanifest.body'
)
const manifestMetaPath = join(
  root,
  '.next/server/app/manifest.webmanifest.meta'
)
const homeHtmlPath = join(root, '.next/server/app/index.html')
const routesManifestPath = join(root, '.next/routes-manifest.json')
const workerPath = join(root, 'public/sw.js')
const offlinePath = join(root, 'public/offline.html')

const errors: string[] = []

function check(condition: unknown, message: string): void {
  if (!condition) errors.push(message)
}

function read(path: string, label: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    errors.push(`${label} is missing; run a clean \`pnpm build\``)
    return ''
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function pngDimensions(path: string): [number, number] | null {
  try {
    const bytes = readFileSync(path)
    const signature = bytes.subarray(0, 8).toString('hex')
    if (signature !== '89504e470d0a1a0a' || bytes.length < 24) return null
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  } catch {
    return null
  }
}

const manifestText = read(manifestBodyPath, 'built web app manifest')
let manifest: Record<string, unknown> = {}
try {
  manifest = object(JSON.parse(manifestText))
} catch {
  errors.push('built web app manifest is not valid JSON')
}

for (const [field, expected] of [
  ['id', '/'],
  ['start_url', '/'],
  ['scope', '/'],
  ['display', 'standalone'],
  ['lang', 'en-US'],
  ['dir', 'ltr'],
  ['background_color', '#F5F3F0'],
  ['theme_color', '#2B4A3E'],
] as const) {
  check(manifest[field] === expected, `manifest ${field} must be ${expected}`)
}
check(
  manifest.prefer_related_applications === false,
  'manifest must prefer this web app rather than a related native app'
)
check(
  typeof manifest.name === 'string' && manifest.name.length > 0,
  'manifest name is missing'
)
check(
  typeof manifest.short_name === 'string' && manifest.short_name.length > 0,
  'manifest short_name is missing'
)
check(
  typeof manifest.description === 'string' && manifest.description.length > 0,
  'manifest description is missing'
)

const icons = Array.isArray(manifest.icons) ? manifest.icons.map(object) : []
for (const purpose of ['any', 'maskable']) {
  for (const size of ['192x192', '512x512']) {
    check(
      icons.some((icon) => icon.purpose === purpose && icon.sizes === size),
      `manifest needs a ${size} ${purpose} icon`
    )
  }
}

for (const icon of icons) {
  if (
    typeof icon.src !== 'string' ||
    typeof icon.sizes !== 'string' ||
    icon.type !== 'image/png'
  ) {
    errors.push('every manifest icon must declare a PNG src and exact size')
    continue
  }
  const expected = icon.sizes.split('x').map(Number)
  const actual = pngDimensions(join(root, 'public', icon.src))
  check(
    actual?.[0] === expected[0] && actual?.[1] === expected[1],
    `${icon.src} must be an actual ${icon.sizes} PNG`
  )
}

const manifestMeta = object(
  JSON.parse(read(manifestMetaPath, 'built manifest response metadata') || '{}')
)
const manifestHeaders = object(manifestMeta.headers)
check(
  String(manifestHeaders['content-type']).startsWith(
    'application/manifest+json'
  ),
  'manifest response must use application/manifest+json'
)

const homeHtml = read(homeHtmlPath, 'built homepage HTML')
check(
  (homeHtml.match(/<link[^>]+rel="manifest"/g) ?? []).length === 1,
  'homepage must link exactly one web app manifest'
)
check(
  /<meta[^>]+name="theme-color"[^>]+content="#2B4A3E"/i.test(homeHtml),
  'homepage must emit the manifest theme color'
)
for (const appleTag of [
  'apple-mobile-web-app-capable',
  'apple-mobile-web-app-status-bar-style',
  'apple-mobile-web-app-title',
]) {
  check(
    homeHtml.includes(`name="${appleTag}"`),
    `homepage is missing ${appleTag}`
  )
}
check(
  /<link[^>]+rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png"/i.test(
    homeHtml
  ),
  'homepage must link the Apple touch icon'
)
const appleIcon = pngDimensions(join(root, 'public/apple-touch-icon.png'))
check(
  appleIcon?.[0] === 180 && appleIcon?.[1] === 180,
  'Apple touch icon must be an actual 180x180 PNG'
)

const workerSource = read(workerPath, 'service worker')
try {
  new Script(workerSource, { filename: 'public/sw.js' })
} catch (error) {
  errors.push(`service worker is not valid JavaScript: ${String(error)}`)
}
check(
  workerSource.includes("const CACHE_PREFIX = 'philipithomas-pwa'"),
  'service worker caches must use the site-specific prefix'
)
check(
  workerSource.includes("'/offline.html'"),
  'service worker must precache the offline fallback'
)

const offlineHtml = read(offlinePath, 'offline fallback')
check(
  /<meta[^>]+name="robots"[^>]+content="noindex, nofollow"/i.test(offlineHtml),
  'offline fallback must be noindex, nofollow'
)
check(
  offlineHtml.includes('/offline.css'),
  'offline fallback must use its precached stylesheet'
)
check(
  offlineHtml.includes('href="/" data-pwa-retry'),
  'offline fallback must preserve a worker-injected retry destination'
)
check(
  !/<script\b/i.test(offlineHtml),
  'offline fallback must work without JavaScript'
)

try {
  check(
    statSync(join(root, 'public/offline.css')).size > 0,
    'offline CSS is empty'
  )
} catch {
  errors.push('offline CSS is missing')
}

const routesManifest = object(
  JSON.parse(read(routesManifestPath, 'Next routes manifest') || '{}')
)
const routeHeaders = Array.isArray(routesManifest.headers)
  ? routesManifest.headers.map(object)
  : []

function headersFor(source: string): Map<string, string> {
  const route = routeHeaders.find((candidate) => candidate.source === source)
  const headers = route && Array.isArray(route.headers) ? route.headers : []
  return new Map(
    headers.map((header) => {
      const entry = object(header)
      return [String(entry.key).toLowerCase(), String(entry.value)]
    })
  )
}

const workerHeaders = headersFor('/sw.js')
check(
  workerHeaders.get('content-type') === 'application/javascript; charset=utf-8',
  'service worker must use the JavaScript content type'
)
check(
  workerHeaders.get('cache-control') === 'no-cache, no-store, must-revalidate',
  'service worker must never be served from an HTTP cache'
)
check(
  workerHeaders.get('service-worker-allowed') === '/',
  'service worker must explicitly allow root scope'
)
check(
  workerHeaders.get('content-security-policy') ===
    "default-src 'self'; script-src 'self'; connect-src 'self'",
  'service worker must have a same-origin-only CSP'
)

for (const source of [
  '/account/:path*',
  '/unsubscribe/:path*',
  '/admin/:path*',
  '/printing-press/:path*',
]) {
  check(
    headersFor(source).get('cache-control') === 'private, no-store',
    `${source} must remain private, no-store`
  )
}

const globalCsp = headersFor('/(.*)').get('content-security-policy') ?? ''
check(
  globalCsp.includes("manifest-src 'self'"),
  'global CSP must allow the manifest'
)
check(
  globalCsp.includes("worker-src 'self'"),
  'global CSP must allow the worker'
)

if (errors.length > 0) {
  console.error('PWA check failed:\n')
  for (const error of errors) console.error(`  - ${error}`)
  console.error(`\n${errors.length} problem(s).`)
  process.exit(1)
}

console.log(
  `PWA check passed: install metadata, icons, worker, offline shell, cache boundaries, and response headers are complete.`
)
