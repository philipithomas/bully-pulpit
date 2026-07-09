import { describe, expect, it } from 'vitest'
import { getPageText, PAGE_TEXT_MAX_CHARS } from '@/lib/chat/page-content'
import { getAllPosts, getPostsByNewsletter } from '@/lib/content/loader'

describe('getPageText', () => {
  it('summarizes the homepage', () => {
    const text = getPageText('/')
    expect(text).toContain('Philip I. Thomas')
    expect(text).toContain('Contraption (/contraption)')
    expect(text).toContain('Workshop (/workshop)')
    expect(text).toContain('Postcard (/postcard)')
    expect(text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS)
  })

  it('lists the five most recent posts for a newsletter index', () => {
    const text = getPageText('/workshop')
    expect(text).toContain('Journal about work in progress.')
    const recent = getPostsByNewsletter('workshop').slice(0, 5)
    expect(recent.length).toBeGreaterThan(0)
    for (const post of recent) {
      expect(text).toContain(post.frontmatter.title)
      expect(text).toContain(post.frontmatter.publishedAt)
    }
  })

  it('returns the plaintext of a content page', () => {
    const text = getPageText('/colophon')
    expect(text).toContain('Colophon')
    expect(text).toContain('Active voice')
    // JSX/HTML tags and markdown headings are stripped
    expect(text).not.toMatch(/<[^>]+>/)
    expect(text).not.toMatch(/^#{1,6}\s/m)
  })

  it('gives Bell the complete public Stargazing list', () => {
    const text = getPageText('/stargazing')
    expect(text).toContain('45 Michelin-starred restaurants')
    expect(text).toContain('Silo | London')
    expect(text).toContain('Eleven Madison Park')
    expect(text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS)
  })

  it('uses the active phone number in contact page text', () => {
    const previous = process.env.PHONE_NUMBER
    process.env.PHONE_NUMBER = '+442079460000'
    try {
      const text = getPageText('/contact')
      expect(text).toContain('Telephone: +442079460000')
      expect(text).not.toContain('+1 212 347 3190')
    } finally {
      if (previous === undefined) delete process.env.PHONE_NUMBER
      else process.env.PHONE_NUMBER = previous
    }
  })

  it('omits the telephone from contact page text when it is unconfigured', () => {
    const previous = process.env.PHONE_NUMBER
    delete process.env.PHONE_NUMBER
    try {
      const text = getPageText('/contact')
      expect(text).not.toContain('Telephone:')
      expect(text).not.toContain('+1 212 347 3190')
    } finally {
      if (previous !== undefined) process.env.PHONE_NUMBER = previous
    }
  })

  it('omits an invalid phone number from contact page text', () => {
    const previous = process.env.PHONE_NUMBER
    process.env.PHONE_NUMBER = 'not-a-phone-number'
    try {
      expect(getPageText('/contact')).not.toContain('Telephone:')
    } finally {
      if (previous === undefined) delete process.env.PHONE_NUMBER
      else process.env.PHONE_NUMBER = previous
    }
  })

  it('returns the plaintext of a post', () => {
    const post = getAllPosts()[0]
    const text = getPageText(`/${post.slug}`)
    expect(text).toContain(post.frontmatter.title)
    expect(text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS)
  })

  it('handles a trailing slash', () => {
    expect(getPageText('/colophon/')).toContain('Colophon')
  })

  it('returns a not-found message for unknown paths', () => {
    expect(getPageText('/no-such-page-exists-here')).toContain('No page exists')
    expect(getPageText('/feed/contraption')).toContain('No page exists')
    expect(getPageText('not-a-path')).toContain('No page exists')
  })

  it('bounds every response to maxChars', () => {
    expect(getPageText('/colophon', 100).length).toBeLessThanOrEqual(100)
    expect(getPageText('/', 100).length).toBeLessThanOrEqual(100)
    for (const path of ['/', '/contraption', '/colophon', '/nope']) {
      expect(getPageText(path).length).toBeLessThanOrEqual(PAGE_TEXT_MAX_CHARS)
    }
  })
})
