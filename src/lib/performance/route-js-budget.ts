/**
 * Measure initial client JavaScript from Next.js client-reference manifests.
 * Hashed chunk names are always discovered from the build output rather than
 * copied into the budget configuration.
 */

import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { runInNewContext } from 'node:vm'
import { brotliCompressSync, constants } from 'node:zlib'

export type RouteBudget = {
  appEntry: string
  label: string
  maximumBytes: number
}

export type RouteMeasurement = RouteBudget & {
  brotliBytes: number
  chunks: string[]
}

type ClientReferenceManifest = {
  entryJSFiles?: Record<string, unknown>
}

type ManifestContext = {
  __RSC_MANIFEST?: Record<string, ClientReferenceManifest>
  process: {
    env: NodeJS.ProcessEnv
  }
}

type MeasureOptions = {
  cache?: Map<string, number>
  compress?: (source: Buffer) => number
  read?: (path: string) => Buffer
}

/** Roughly 25% headroom above the September 2026 main build. */
export const PUBLIC_ROUTE_BUDGETS: RouteBudget[] = [
  { label: '/', appEntry: 'page', maximumBytes: 175 * 1024 },
  {
    label: '/:slug (post or content page)',
    appEntry: '[slug]/page',
    maximumBytes: 205 * 1024,
  },
  {
    label: '/contraption',
    appEntry: 'contraption/page',
    maximumBytes: 130 * 1024,
  },
  {
    label: '/workshop',
    appEntry: 'workshop/page',
    maximumBytes: 130 * 1024,
  },
  {
    label: '/postcard',
    appEntry: 'postcard/page',
    maximumBytes: 130 * 1024,
  },
  {
    label: '/tidbits',
    appEntry: 'tidbits/page',
    maximumBytes: 175 * 1024,
  },
  {
    label: '/tsundoku',
    appEntry: 'tsundoku/page',
    maximumBytes: 175 * 1024,
  },
  {
    label: '/photography',
    appEntry: 'photography/page',
    maximumBytes: 130 * 1024,
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

function manifestPath(buildDir: string, appEntry: string): string {
  return join(
    buildDir,
    'server',
    'app',
    `${appEntry}_client-reference-manifest.js`
  )
}

function routeChunks(
  manifestSource: string,
  appEntry: string,
  filename: string
): string[] {
  // Vercel's production build can leave environment checks in this generated
  // manifest. Expose only the environment bag those checks need, rather than
  // the full Node process object, while keeping code generation disabled.
  const context: ManifestContext = { process: { env: { ...process.env } } }
  runInNewContext(manifestSource, context, {
    contextCodeGeneration: { strings: false, wasm: false },
    filename,
    timeout: 1000,
  })

  const routeKey = `/${appEntry}`
  const manifest = context.__RSC_MANIFEST?.[routeKey]
  if (!manifest) {
    throw new Error(`manifest does not contain route key ${routeKey}`)
  }

  const entryFiles = manifest.entryJSFiles
  if (!entryFiles) throw new Error('manifest does not contain entryJSFiles')

  const sourceSuffix = `/src/app/${appEntry}`
  const matches = Object.entries(entryFiles).filter(([source]) =>
    source.endsWith(sourceSuffix)
  )
  if (matches.length !== 1) {
    throw new Error(
      `expected one ${sourceSuffix} entry, found ${matches.length}`
    )
  }

  const chunks = matches[0][1]
  if (
    !Array.isArray(chunks) ||
    chunks.some((chunk) => typeof chunk !== 'string')
  ) {
    throw new Error(`route entry ${sourceSuffix} has an invalid chunk list`)
  }
  if (chunks.length === 0) {
    throw new Error(`route entry ${sourceSuffix} has no initial chunks`)
  }

  return [...new Set(chunks)]
}

function chunkPath(buildDir: string, chunk: string): string {
  const buildRelative = chunk.startsWith('/_next/')
    ? chunk.slice('/_next/'.length)
    : chunk
  if (!buildRelative.startsWith('static/chunks/')) {
    throw new Error(`route references unexpected client chunk ${chunk}`)
  }
  return join(buildDir, buildRelative)
}

export function measureRoute(
  buildDir: string,
  budget: RouteBudget,
  options: MeasureOptions = {}
): RouteMeasurement {
  const file = manifestPath(buildDir, budget.appEntry)
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    throw new Error(
      `${relative(process.cwd(), file)} is missing; run \`pnpm build\` first`
    )
  }

  const chunks = routeChunks(source, budget.appEntry, file)
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

  return { ...budget, brotliBytes, chunks }
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
          `${budget.label}: ${formatBytes(measurement.brotliBytes)} exceeds ${formatBytes(budget.maximumBytes)}`
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
