import { describe, expect, it } from 'vitest'
import {
  getPageContextContent,
  PAGE_CONTENT_MAX_CHARS,
  toPlaintext,
} from '@/lib/chat/page-context'
import { getAllPosts, getPageBySlug } from '@/lib/content/loader'

describe('getPageContextContent', () => {
  it('resolves a known post path to its title and content', () => {
    const post = getAllPosts()[0]
    const result = getPageContextContent(`/${post.slug}`)
    expect(result).not.toBeNull()
    expect(result?.slug).toBe(post.slug)
    expect(result?.title).toBe(post.frontmatter.title)
    expect(result?.content.length).toBeGreaterThan(0)
    expect(result?.content.length).toBeLessThanOrEqual(PAGE_CONTENT_MAX_CHARS)
  })

  it('resolves a known content page path', () => {
    const page = getPageBySlug('colophon')
    expect(page).not.toBeNull()
    const result = getPageContextContent('/colophon')
    expect(result).not.toBeNull()
    expect(result?.title).toBe(page?.frontmatter.title)
  })

  it('injects the public Stargazing ledger into current-page context', () => {
    const result = getPageContextContent('/stargazing')
    expect(result?.content).toContain('Silo | London')
    expect(result?.content).toContain('Osteria Francescana')
    expect(result?.truncated).toBe(false)
  })

  it('uses the active phone number in contact page context', () => {
    const previous = process.env.PHONE_NUMBER
    process.env.PHONE_NUMBER = '+442079460000'
    try {
      const result = getPageContextContent('/contact')
      expect(result?.content).toContain('Telephone: +442079460000')
      expect(result?.content).not.toContain('+1 212 347 3190')
    } finally {
      if (previous === undefined) delete process.env.PHONE_NUMBER
      else process.env.PHONE_NUMBER = previous
    }
  })

  it('handles a trailing slash', () => {
    const post = getAllPosts()[0]
    expect(getPageContextContent(`/${post.slug}/`)?.slug).toBe(post.slug)
  })

  it('resolves registered app pages through the shared Bell text', () => {
    const home = getPageContextContent('/')
    expect(home).toMatchObject({
      slug: 'app-home',
      title: 'Home',
      fetchPath: '/',
      truncated: false,
    })
    expect(home?.content).toContain('Philip I. Thomas')

    const print = getPageContextContent('/print')
    expect(print?.content).toContain('no longer available to order')
  })

  it('returns null for unknown paths', () => {
    expect(getPageContextContent('/no-such-post-exists-here')).toBeNull()
  })

  it('returns null for nested paths', () => {
    expect(getPageContextContent('/feed/contraption')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(getPageContextContent(undefined)).toBeNull()
    expect(getPageContextContent(42)).toBeNull()
    expect(getPageContextContent({ path: '/colophon' })).toBeNull()
  })

  it('truncates long content and sets the truncated flag', () => {
    const post = getAllPosts().find(
      (candidate) => toPlaintext(candidate.content).length > 100
    )
    if (!post) throw new Error('Expected at least one long post')
    const result = getPageContextContent(`/${post.slug}`, 100)
    expect(result?.truncated).toBe(true)
    expect(result?.content.length).toBe(100)
  })

  it('strips markdown image and link syntax from the content', () => {
    for (const post of getAllPosts().slice(0, 10)) {
      const result = getPageContextContent(`/${post.slug}`)
      expect(result?.content).not.toContain('![')
      expect(result?.content).not.toMatch(/\]\(/)
    }
  })
})
