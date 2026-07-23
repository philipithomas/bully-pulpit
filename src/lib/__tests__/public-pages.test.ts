import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPageText } from '@/lib/chat/page-content'
import {
  findPublicAppPage,
  PRINT_EDITION_STATUS_TEXT,
  PUBLIC_APP_PAGE_PATHS,
  publicAppPages,
} from '@/lib/public-pages'

const NON_REGISTRY_PAGE_PREFIXES = [
  '/[slug]',
  '/account',
  '/printing-press',
  '/unsubscribe',
]

function publicAppRouterPaths(): string[] {
  const appDir = path.join(process.cwd(), 'src/app')
  const paths: string[] = []

  function visit(directory: string) {
    if (fs.existsSync(path.join(directory, 'page.tsx'))) {
      const relative = path.relative(appDir, directory)
      const pagePath = relative ? `/${relative}` : '/'
      if (
        !NON_REGISTRY_PAGE_PREFIXES.some(
          (prefix) => pagePath === prefix || pagePath.startsWith(`${prefix}/`)
        )
      ) {
        paths.push(pagePath)
      }
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(directory, entry.name))
    }
  }

  visit(appDir)
  return paths.sort()
}

describe('public app page registry', () => {
  it('covers every indexable App Router page', () => {
    expect(publicAppPages.map((page) => page.path).sort()).toEqual(
      publicAppRouterPaths()
    )
    expect(publicAppPages.map((page) => page.path)).toEqual(
      PUBLIC_APP_PAGE_PATHS
    )
  })

  it('keeps stable unique IDs and paths', () => {
    expect(new Set(publicAppPages.map((page) => page.id)).size).toBe(
      publicAppPages.length
    )
    expect(new Set(publicAppPages.map((page) => page.path)).size).toBe(
      publicAppPages.length
    )
  })

  it('gives every registered page searchable and Bell-readable text', () => {
    for (const page of publicAppPages) {
      expect(page.searchText.trim().length).toBeGreaterThan(20)
      expect(page.bellText().trim().length).toBeGreaterThan(20)
      expect(getPageText(page.path)).toContain(page.title)
      expect(getPageText(page.path)).not.toContain('No page exists')
    }
  })

  it('normalizes trailing slashes without accepting query strings', () => {
    expect(findPublicAppPage('/print/')?.path).toBe('/print')
    expect(findPublicAppPage('/print?source=test')).toBeNull()
  })

  it('shares the concluded print-edition fact and removes stale snail mail', () => {
    expect(getPageText('/print')).toContain(PRINT_EDITION_STATUS_TEXT)
    expect(getPageText('/')).toContain('available by email, RSS, and SMS')
    expect(getPageText('/')).not.toContain('snail mail')
  })

  it('shares the approved tidbits description with search and SEO', () => {
    const tidbits = findPublicAppPage('/tidbits')

    expect(tidbits?.description).toBe(
      'An ongoing photo journal of city life, travel, food, and the details that linger.'
    )
    expect(getPageText('/tidbits')).toContain(tidbits?.description)
  })
})
