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

const NON_REGISTRY_TOP_LEVEL_PAGES = new Set([
  '[slug]',
  'account',
  'printing-press',
  'unsubscribe',
])

function publicTopLevelAppPaths(): string[] {
  const appDir = path.join(process.cwd(), 'src/app')
  const paths = fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => !NON_REGISTRY_TOP_LEVEL_PAGES.has(entry.name))
    .filter((entry) => fs.existsSync(path.join(appDir, entry.name, 'page.tsx')))
    .map((entry) => `/${entry.name}`)

  if (fs.existsSync(path.join(appDir, 'page.tsx'))) paths.push('/')
  return paths.sort()
}

describe('public app page registry', () => {
  it('covers every indexable top-level App Router page', () => {
    expect(publicAppPages.map((page) => page.path).sort()).toEqual(
      publicTopLevelAppPaths()
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

  it('gives umami an expressive search and SEO description', () => {
    const umami = findPublicAppPage('/umami')

    expect(umami?.description).toBe(
      'An ongoing photography newsletter by Philip Thomas about street scenes, city life, coffee, and other things he notices along the way.'
    )
    expect(getPageText('/umami')).toContain(umami?.description)
  })
})
