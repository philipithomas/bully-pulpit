import { describe, expect, it } from 'vitest'
import {
  createHeadingSlugger,
  slugifyHeading,
} from '@/lib/search/heading-anchor'

/**
 * Parity fixtures: these expectations define the anchor algorithm shared
 * with the web render (src/lib/content/slugify.ts on the
 * feat/heading-anchors-toc branch). If a fixture here changes, the web copy
 * must change with it or section links break.
 */

describe('slugifyHeading', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyHeading('Hello World')).toBe('hello-world')
  })

  it('strips punctuation', () => {
    expect(slugifyHeading("What didn't work, exactly?")).toBe(
      'what-didnt-work-exactly'
    )
    expect(slugifyHeading('Setup: part one.')).toBe('setup-part-one')
  })

  it('keeps hyphens and underscores', () => {
    expect(slugifyHeading('foo_bar-baz')).toBe('foo_bar-baz')
  })

  it('maps each space to a hyphen, GitHub style', () => {
    expect(slugifyHeading('a  b')).toBe('a--b')
    expect(slugifyHeading('a - b')).toBe('a---b')
  })

  it('keeps unicode letters and numbers', () => {
    expect(slugifyHeading('Café au lait')).toBe('café-au-lait')
    expect(slugifyHeading('日本語 テスト 2')).toBe('日本語-テスト-2')
  })

  it('strips emoji', () => {
    expect(slugifyHeading('Launch 🚀 day')).toBe('launch--day')
  })

  it('trims surrounding whitespace', () => {
    expect(slugifyHeading('  Padded  ')).toBe('padded')
  })
})

describe('createHeadingSlugger', () => {
  it('dedupes duplicates with -2, -3 suffixes in document order', () => {
    const slug = createHeadingSlugger()
    expect(slug('Setup')).toBe('setup')
    expect(slug('Setup')).toBe('setup-2')
    expect(slug('Setup')).toBe('setup-3')
  })

  it('keeps distinct headings independent', () => {
    const slug = createHeadingSlugger()
    expect(slug('Alpha')).toBe('alpha')
    expect(slug('Beta')).toBe('beta')
    expect(slug('Alpha')).toBe('alpha-2')
    expect(slug('Beta')).toBe('beta-2')
  })

  it('skips candidates already taken by a literal heading', () => {
    const slug = createHeadingSlugger()
    expect(slug('Setup-2')).toBe('setup-2')
    expect(slug('Setup')).toBe('setup')
    expect(slug('Setup')).toBe('setup-3')
  })

  it('is independent per document', () => {
    const a = createHeadingSlugger()
    const b = createHeadingSlugger()
    expect(a('Setup')).toBe('setup')
    expect(b('Setup')).toBe('setup')
  })
})
