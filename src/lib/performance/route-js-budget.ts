/**
 * Measure modern Next.js boot chunks referenced by prerendered route HTML.
 * Hashed chunk names and generated paths always come from the build output.
 */

import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

export type RouteBudget = {
  /** Exact route, or a source route such as /[slug] when match is `source`. */
  route: string
  match?: 'exact' | 'source'
  label: string
  maximumBytes: number
}

export type RouteMeasurement = RouteBudget & {
  brotliBytes: number
  chunks: string[]
  measuredRoute: string
  routeCount: number
}

type PrerenderManifest = {
  routes?: Record<string, { srcRoute?: string | null }>
}

type MeasureOptions = {
  cache?: Map<string, number>
  compress?: (source: Buffer) => number
  read?: (path: string) => Buffer
}

/** Roughly 25% headroom above the September 2026 main build. */
export const PUBLIC_ROUTE_BUDGETS: RouteBudget[] = [
  { label: '/', route: '/', maximumBytes: 365 * 1024 },
  {
    label: '/:slug (post or content page)',
    route: '/[slug]',
    match: 'source',
    maximumBytes: 395 * 1024,
  },
  {
    label: '/contraption',
    route: '/contraption',
    maximumBytes: 315 * 1024,
  },
  {
    label: '/workshop',
    route: '/workshop',
    maximumBytes: 315 * 1024,
  },
  {
    label: '/postcard',
    route: '/postcard',
    maximumBytes: 315 * 1024,
  },
  {
    label: '/tidbits',
    route: '/tidbits',
    maximumBytes: 365 * 1024,
  },
  {
    label: '/tsundoku',
    route: '/tsundoku',
    maximumBytes: 365 * 1024,
  },
  {
    label: '/photography',
    route: '/photography',
    maximumBytes: 315 * 1024,
  },
]

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KiB`
}

export function brotliByteLength(source: Buffer): number {
  return brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
    },
  }).byteLength
}

function readPrerenderManifest(buildDir: string): PrerenderManifest {
  const file = join(buildDir, 'prerender-manifest.json')
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as PrerenderManifest
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : ''
    throw new Error(
      `${relative(process.cwd(), file)} is missing or invalid; run \`pnpm build\` first${reason}`
    )
  }
}

function matchingRoutes(
  manifest: PrerenderManifest,
  budget: RouteBudget
): string[] {
  const routes = manifest.routes ?? {}
  if ((budget.match ?? 'exact') === 'exact') {
    if (!(budget.route in routes)) {
      throw new Error(`prerender manifest does not contain ${budget.route}`)
    }
    return [budget.route]
  }

  const matches = Object.entries(routes)
    .filter(([, entry]) => entry.srcRoute === budget.route)
    .map(([route]) => route)
    .sort()
  if (matches.length === 0) {
    throw new Error(
      `prerender manifest has no pages generated from ${budget.route}`
    )
  }
  return matches
}

function htmlPath(buildDir: string, route: string): string {
  const routePath = route === '/' ? 'index' : route.slice(1)
  if (
    routePath.length === 0 ||
    routePath.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`invalid prerendered route ${route}`)
  }
  return join(buildDir, 'server', 'app', `${routePath}.html`)
}

function modernBootChunks(html: string): string[] {
  const chunks: string[] = []
  const scripts = html.matchAll(
    /<script\b[^>]*\bsrc=(?:"([^"]+)"|'([^']+)')[^>]*>/gi
  )

  for (const match of scripts) {
    const tag = match[0]
    // Next can emit nomodule fallbacks for legacy browsers alongside the
    // modern scripts. A modern browser never downloads those fallback chunks.
    if (
      /\snomodule(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|\/?>)/i.test(tag)
    ) {
      continue
    }
    const src = match[1] ?? match[2]
    let pathname: string
    try {
      pathname = new URL(src, 'https://build.invalid').pathname
    } catch {
      continue
    }
    if (
      pathname.startsWith('/_next/static/chunks/') &&
      pathname.endsWith('.js')
    ) {
      chunks.push(pathname.slice('/_next/'.length))
    }
  }

  return [...new Set(chunks)]
}

function chunkPath(buildDir: string, chunk: string): string {
  if (!chunk.startsWith('static/chunks/') || !chunk.endsWith('.js')) {
    throw new Error(`route references unexpected client chunk ${chunk}`)
  }
  return join(buildDir, chunk)
}

function measurePrerenderedRoute(
  buildDir: string,
  route: string,
  options: MeasureOptions
): { brotliBytes: number; chunks: string[] } {
  const file = htmlPath(buildDir, route)
  let html: string
  try {
    html = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`${relative(process.cwd(), file)} is missing`)
  }

  const chunks = modernBootChunks(html)
  if (chunks.length === 0) {
    throw new Error(`${route} HTML has no modern Next.js boot chunks`)
  }

  const read = options.read ?? readFileSync
  const compress = options.compress ?? brotliByteLength
  let brotliBytes = 0

  for (const chunk of chunks) {
    const filePath = chunkPath(buildDir, chunk)
    try {
      const cached = options.cache?.get(filePath)
      if (cached !== undefined) {
        brotliBytes += cached
        continue
      }

      const compressedBytes = compress(read(filePath))
      options.cache?.set(filePath, compressedBytes)
      brotliBytes += compressedBytes
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : ''
      throw new Error(`cannot measure ${chunk}${reason}`)
    }
  }

  return { brotliBytes, chunks }
}

export function measureRoute(
  buildDir: string,
  budget: RouteBudget,
  options: MeasureOptions = {}
): RouteMeasurement {
  const routes = matchingRoutes(readPrerenderManifest(buildDir), budget)
  let largest:
    | { brotliBytes: number; chunks: string[]; measuredRoute: string }
    | undefined

  for (const route of routes) {
    const measurement = measurePrerenderedRoute(buildDir, route, options)
    if (!largest || measurement.brotliBytes > largest.brotliBytes) {
      largest = { ...measurement, measuredRoute: route }
    }
  }

  if (!largest) throw new Error(`no prerendered HTML matched ${budget.route}`)
  return { ...budget, ...largest, routeCount: routes.length }
}

export function evaluateBudgets(
  buildDir: string,
  budgets: RouteBudget[] = PUBLIC_ROUTE_BUDGETS,
  options: MeasureOptions = {}
): { errors: string[]; measurements: RouteMeasurement[] } {
  const errors: string[] = []
  const measurements: RouteMeasurement[] = []
  const sharedOptions = { ...options, cache: options.cache ?? new Map() }

  for (const budget of budgets) {
    try {
      const measurement = measureRoute(buildDir, budget, sharedOptions)
      measurements.push(measurement)
      if (measurement.brotliBytes > budget.maximumBytes) {
        errors.push(
          `${budget.label}: ${formatBytes(measurement.brotliBytes)} exceeds ${formatBytes(budget.maximumBytes)} (${measurement.measuredRoute})`
        )
      }
    } catch (error) {
      errors.push(
        `${budget.label}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return { errors, measurements }
}
