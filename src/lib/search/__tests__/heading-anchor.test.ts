import { describe, expect, it } from 'vitest'
import { createSlugger, slugify } from '@/lib/content/slugify'
import {
  createHeadingSlugger,
  slugifyHeading,
} from '@/lib/search/heading-anchor'

/**
 * The search module computes section-citation anchors through the canonical
 * web slugger (src/lib/content/slugify.ts) so Bell links land on the ids the
 * page actually renders. These tests pin that re-export and guard the cases
 * that used to diverge: an accent, an underscore, or a double space once
 * produced a search-only anchor the web render never emitted.
 */

describe('heading-anchor re-export', () => {
  it('is the canonical slugify under search-facing names', () => {
    expect(slugifyHeading).toBe(slugify)
    expect(createHeadingSlugger).toBe(createSlugger)
  })

  it('matches the web render on previously divergent inputs', () => {
    // Accents drop (web strips non [a-z0-9-]), not kept as café-au-lait.
    expect(slugifyHeading('Café au lait')).toBe('caf-au-lait')
    // Underscores drop, not kept as foo_bar.
    expect(slugifyHeading('foo_bar baz')).toBe('foobar-baz')
    // Space runs collapse to one hyphen, not a--b.
    expect(slugifyHeading('a  b')).toBe('a-b')
  })

  it('dedupes duplicates with -2, -3 suffixes in document order', () => {
    const slug = createHeadingSlugger()
    expect(slug('Setup')).toBe('setup')
    expect(slug('Setup')).toBe('setup-2')
    expect(slug('Setup')).toBe('setup-3')
  })
})
