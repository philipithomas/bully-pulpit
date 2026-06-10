import { describe, expect, it } from 'vitest'
import { createSlugger, slugify } from '@/lib/content/slugify'

describe('slugify', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugify('Finding Direction')).toBe('finding-direction')
  })

  it('trims surrounding whitespace', () => {
    expect(slugify('  Where I am  ')).toBe('where-i-am')
  })

  it('strips apostrophes and punctuation', () => {
    expect(slugify("What didn't work in my process")).toBe(
      'what-didnt-work-in-my-process'
    )
    expect(slugify('What’s next?')).toBe('whats-next')
  })

  it('strips emoji', () => {
    expect(slugify('🤔 Things to share')).toBe('things-to-share')
  })

  it('keeps numbers', () => {
    expect(slugify('2014')).toBe('2014')
    expect(slugify('1% Rule and Minimum Viable Community')).toBe(
      '1-rule-and-minimum-viable-community'
    )
  })

  it('collapses repeated whitespace and hyphens', () => {
    expect(slugify('a  b — c')).toBe('a-b-c')
  })

  it('returns an empty string when nothing survives', () => {
    expect(slugify('🤔 ✨')).toBe('')
    expect(slugify('---')).toBe('')
  })
})

describe('createSlugger', () => {
  it('deduplicates repeated headings with -2, -3 suffixes', () => {
    const slug = createSlugger()
    expect(slug('Notes')).toBe('notes')
    expect(slug('Notes')).toBe('notes-2')
    expect(slug('Notes')).toBe('notes-3')
  })

  it('does not share counts between sluggers', () => {
    const a = createSlugger()
    const b = createSlugger()
    expect(a('Notes')).toBe('notes')
    expect(b('Notes')).toBe('notes')
  })

  it('skips slugs already taken by an explicit heading', () => {
    const slug = createSlugger()
    expect(slug('Foo')).toBe('foo')
    expect(slug('Foo 2')).toBe('foo-2')
    expect(slug('Foo')).toBe('foo-3')
  })

  it('returns an empty string for empty text without advancing counts', () => {
    const slug = createSlugger()
    expect(slug('✨')).toBe('')
    expect(slug('Real heading')).toBe('real-heading')
    expect(slug('✨')).toBe('')
  })
})
