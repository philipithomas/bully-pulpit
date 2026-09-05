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

type PageFixture = {
  route: string
  srcRoute?: string | null
  chunks: string[]
}

const sources: Record<string, string> = {
  'static/chunks/bootstrap-hash.js': 'boot',
  'static/chunks/first-hash.js': 'first',
  'static/chunks/second-hash.js': 'second!',
  'static/chunks/large-hash.js': 'large source',
}

async function buildFixture(
  pages: PageFixture[] = [
    {
      route: '/',
      chunks: [
        'static/chunks/bootstrap-hash.js',
        'static/chunks/first-hash.js',
        'static/chunks/second-hash.js',
      ],
    },
  ]
) {
  const buildDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bp-budget-'))
  tempDirs.push(buildDir)

  const routes = Object.fromEntries(
    pages.map((page) => [page.route, { srcRoute: page.srcRoute ?? null }])
  )
  await fs.writeFile(
    path.join(buildDir, 'prerender-manifest.json'),
    JSON.stringify({ routes })
  )

  for (const page of pages) {
    const routePath = page.route === '/' ? 'index' : page.route.slice(1)
    const file = path.join(buildDir, 'server/app', `${routePath}.html`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    const scripts = page.chunks
      .map((chunk) => `<script src="/_next/${chunk}?v=fixture"></script>`)
      .join('')
    await fs.writeFile(file, `<html><body>${scripts}</body></html>`)
  }

  for (const [chunk, source] of Object.entries(sources)) {
    const file = path.join(buildDir, chunk)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, source)
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
    route: '/',
    maximumBytes: 100,
  }

  it('counts every unique Next.js chunk referenced by the initial HTML', async () => {
    const buildDir = await buildFixture([
      {
        route: '/',
        chunks: [
          'static/chunks/bootstrap-hash.js',
          'static/chunks/first-hash.js',
          'static/chunks/second-hash.js',
          'static/chunks/first-hash.js',
        ],
      },
    ])

    const measurement = measureRoute(buildDir, budget, {
      compress: (source) => source.byteLength,
    })

    expect(measurement.chunks).toEqual([
      'static/chunks/bootstrap-hash.js',
      'static/chunks/first-hash.js',
      'static/chunks/second-hash.js',
    ])
    expect(measurement.brotliBytes).toBe(16)
  })

  it('measures every generated dynamic page and guards the largest one', async () => {
    const buildDir = await buildFixture([
      {
        route: '/first',
        srcRoute: '/[slug]',
        chunks: ['static/chunks/first-hash.js'],
      },
      {
        route: '/second',
        srcRoute: '/[slug]',
        chunks: ['static/chunks/first-hash.js', 'static/chunks/large-hash.js'],
      },
      {
        route: '/unrelated',
        chunks: ['static/chunks/second-hash.js'],
      },
    ])

    const measurement = measureRoute(
      buildDir,
      { ...budget, route: '/[slug]', match: 'source' },
      { compress: (source) => source.byteLength }
    )

    expect(measurement.routeCount).toBe(2)
    expect(measurement.measuredRoute).toBe('/second')
    expect(measurement.brotliBytes).toBe(17)
  })

  it('reports route budgets that are exceeded', async () => {
    const buildDir = await buildFixture()

    const result = evaluateBudgets(
      buildDir,
      [{ ...budget, maximumBytes: 15 }],
      { compress: (source) => source.byteLength }
    )

    expect(result.measurements).toHaveLength(1)
    expect(result.errors).toEqual(['/: 16 B exceeds 15 B (/)'])
  })

  it('turns missing build artifacts into an actionable failure', () => {
    const buildDir = path.join(os.tmpdir(), 'missing-bp-build')

    const result = evaluateBudgets(buildDir, [budget])

    expect(result.measurements).toEqual([])
    expect(result.errors[0]).toContain('run `pnpm build` first')
  })

  it('does not treat HTML without client chunks as a zero-byte success', async () => {
    const buildDir = await buildFixture([{ route: '/', chunks: [] }])

    const result = evaluateBudgets(buildDir, [budget])

    expect(result.measurements).toEqual([])
    expect(result.errors).toEqual([
      '/: / HTML has no initial Next.js client chunks',
    ])
  })

  it('uses Brotli rather than raw source bytes', () => {
    const source = Buffer.from('repeat '.repeat(1000))
    expect(brotliByteLength(source)).toBeLessThan(source.byteLength)
  })
})
