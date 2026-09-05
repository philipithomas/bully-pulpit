import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  brotliByteLength,
  evaluateBudgets,
  measureRoute,
  type RouteBudget,
} from '@/lib/performance/route-js-budget'

const tempDirs: string[] = []

async function buildFixture({
  appEntry = 'page',
  chunks = ['static/chunks/first-hash.js', 'static/chunks/second-hash.js'],
  manifestPrelude = '',
}: {
  appEntry?: string
  chunks?: string[]
  manifestPrelude?: string
} = {}) {
  const buildDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-budget-'))
  tempDirs.push(buildDir)

  const manifestPath = path.join(
    buildDir,
    'server/app',
    `${appEntry}_client-reference-manifest.js`
  )
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(
    manifestPath,
    `${manifestPrelude}
globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};
globalThis.__RSC_MANIFEST["/${appEntry}"] = ${JSON.stringify({
      entryJSFiles: {
        '[project]/src/app/layout': ['static/chunks/layout-only.js'],
        [`[project]/src/app/${appEntry}`]: chunks,
      },
    })};`
  )

  const sources: Record<string, string> = {
    'static/chunks/first-hash.js': 'first',
    'static/chunks/second-hash.js': 'second!',
    'static/chunks/layout-only.js': 'not part of the route entry fixture',
  }
  for (const [chunk, source] of Object.entries(sources)) {
    const chunkPath = path.join(buildDir, chunk)
    await fs.mkdir(path.dirname(chunkPath), { recursive: true })
    await fs.writeFile(chunkPath, source)
  }

  return buildDir
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})

describe('built route performance budget', () => {
  const budget: RouteBudget = {
    label: '/',
    appEntry: 'page',
    maximumBytes: 100,
  }

  it('discovers hashed chunks from the route entry and counts each once', async () => {
    const buildDir = await buildFixture({
      chunks: [
        'static/chunks/first-hash.js',
        'static/chunks/second-hash.js',
        'static/chunks/first-hash.js',
      ],
    })

    const measurement = measureRoute(buildDir, budget, {
      compress: (source) => source.byteLength,
    })

    expect(measurement.chunks).toEqual([
      'static/chunks/first-hash.js',
      'static/chunks/second-hash.js',
    ])
    expect(measurement.brotliBytes).toBe(12)
  })

  it('reports route budgets that are exceeded', async () => {
    const buildDir = await buildFixture()

    const result = evaluateBudgets(
      buildDir,
      [{ ...budget, maximumBytes: 11 }],
      { compress: (source) => source.byteLength }
    )

    expect(result.measurements).toHaveLength(1)
    expect(result.errors).toEqual(['/: 12 B exceeds 11 B'])
  })

  it('turns missing build artifacts into an actionable failure', () => {
    const buildDir = path.join(os.tmpdir(), 'missing-bp-build')

    const result = evaluateBudgets(buildDir, [budget])

    expect(result.measurements).toEqual([])
    expect(result.errors[0]).toContain('is missing; run `pnpm build` first')
  })

  it('does not treat an empty route entry as a zero-byte success', async () => {
    const buildDir = await buildFixture({ chunks: [] })

    const result = evaluateBudgets(buildDir, [budget])

    expect(result.measurements).toEqual([])
    expect(result.errors).toEqual([
      '/: route entry /src/app/page has no initial chunks',
    ])
  })

  it('uses Brotli rather than raw source bytes', () => {
    const source = Buffer.from('repeat '.repeat(1000))
    expect(brotliByteLength(source)).toBeLessThan(source.byteLength)
  })

  it('supports environment checks emitted by a Vercel production build', async () => {
    const buildDir = await buildFixture({
      manifestPrelude:
        'if (!process.env.NODE_ENV) throw new Error("missing environment")',
    })

    const result = evaluateBudgets(buildDir, [budget], {
      compress: (source) => source.byteLength,
    })

    expect(result.errors).toEqual([])
    expect(result.measurements).toHaveLength(1)
  })
})
