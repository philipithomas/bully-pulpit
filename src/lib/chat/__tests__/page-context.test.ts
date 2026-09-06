import { describe, expect, it } from 'vitest'
import {
  getPageContextContent,
  getSelectedPassageContext,
  PAGE_CONTENT_MAX_CHARS,
  toPlaintext,
} from '@/lib/chat/page-context'
import { siteConfig } from '@/lib/config'
import { getAllPosts, getPageBySlug } from '@/lib/content/loader'

describe('getPageContextContent', () => {
  it('resolves a known post path to its title and content', () => {
    const post = getAllPosts()[0]
    const result = getPageContextContent(`/${post.slug}`)
    expect(result).not.toBeNull()
    expect(result?.slug).toBe(post.slug)
    expect(result?.title).toBe(post.frontmatter.title)
    expect(result?.source).toEqual({
      type: 'post',
      title: post.frontmatter.title,
      url: `/${post.slug}`,
      publishedAt: post.frontmatter.publishedAt,
      newsletter: post.newsletter,
    })
    expect(result?.content.length).toBeGreaterThan(0)
    expect(result?.content.length).toBeLessThanOrEqual(PAGE_CONTENT_MAX_CHARS)
  })

  it('resolves a known content page path', () => {
    const page = getPageBySlug('colophon')
    expect(page).not.toBeNull()
    const result = getPageContextContent('/colophon')
    expect(result).not.toBeNull()
    expect(result?.title).toBe(page?.frontmatter.title)
    expect(result?.source).toEqual({
      type: 'page',
      title: page?.frontmatter.title,
      url: '/colophon',
      publishedAt: page?.frontmatter.publishedAt ?? null,
      newsletter: 'page',
    })
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
      source: {
        type: 'page',
        title: 'Home',
        url: '/',
        publishedAt: null,
        newsletter: 'page',
      },
    })
    expect(home?.content).toContain(siteConfig.author)

    const print = getPageContextContent('/print')
    expect(print?.content).toContain('no longer available to order')

    const workshop = getPageContextContent('/workshop')
    expect(workshop?.source.newsletter).toBe('workshop')
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

describe('getSelectedPassageContext', () => {
  const quote =
    'The site is a Next.js application with MDX content, statically generated at build time'

  it('resolves the page, quote, and heading against canonical content', () => {
    const pageContent = getPageContextContent('/colophon')
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text: ` ${quote}\n`,
          path: '/colophon',
          headingId: 'technical',
        },
        '/colophon',
        pageContent
      )
    ).toEqual({
      action: 'context',
      text: quote,
      path: '/colophon',
      headingId: 'technical',
      headingText: 'Technical',
      source: {
        type: 'page',
        title: 'Colophon',
        url: '/colophon#technical',
        publishedAt: null,
        newsletter: 'page',
        section: 'Technical',
      },
    })
  })

  it('rejects spoofed paths, noncanonical quotes, and utility pages', () => {
    const validRequest = {
      action: 'explain',
      text: quote,
      path: '/colophon',
      headingId: 'technical',
    }
    expect(
      getSelectedPassageContext(
        { ...validRequest, path: '/privacy' },
        '/colophon',
        getPageContextContent('/colophon')
      )
    ).toBeNull()
    expect(
      getSelectedPassageContext(
        { ...validRequest, text: 'This fabricated quotation is long enough.' },
        '/colophon',
        getPageContextContent('/colophon')
      )
    ).toBeNull()
    expect(
      getSelectedPassageContext(
        {
          action: 'explain',
          text: 'This Privacy Policy describes how your personal information',
          path: '/privacy',
        },
        '/privacy',
        getPageContextContent('/privacy')
      )
    ).toBeNull()
  })

  it('drops a spoofed heading while retaining valid page provenance', () => {
    const context = getSelectedPassageContext(
      {
        action: 'explain',
        text: quote,
        path: '/colophon',
        headingId: 'not-a-real-heading',
      },
      '/colophon',
      getPageContextContent('/colophon')
    )
    expect(context?.headingId).toBeUndefined()
    expect(context?.source.url).toBe('/colophon')
    expect(context?.source.section).toBeUndefined()
  })

  it('drops a real but incorrect heading for the canonical quote', () => {
    const context = getSelectedPassageContext(
      {
        action: 'explain',
        text: quote,
        path: '/colophon',
        headingId: 'typographical',
      },
      '/colophon',
      getPageContextContent('/colophon')
    )
    expect(context?.headingId).toBeUndefined()
    expect(context?.source.url).toBe('/colophon')
  })

  it('matches escaped Markdown punctuation to rendered passage text', () => {
    const path = '/how-to-host-web-apps-on-a-mac-mini'
    const escapedQuote = '*(When I build this, the scripts will be in Github!)'
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text: escapedQuote,
          path,
          headingId: 'disaster-recovery',
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({
      text: escapedQuote,
      headingId: 'disaster-recovery',
      headingText: 'Disaster recovery',
      source: {
        url: `${path}#disaster-recovery`,
        section: 'Disaster recovery',
      },
    })
  })

  it('matches rendered text selected across Markdown list items', () => {
    const path = '/digital-quiet'
    const listQuote =
      'Elevate the threshold for initiating conversations, discouraging trivial interruptions. Promote well-considered, clear communication to reduce the need for follow-up clarifications.'
    expect(
      getSelectedPassageContext(
        {
          action: 'explain',
          text: listQuote,
          path,
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({ text: listQuote, path })
  })

  it('matches rendered text selected across Markdown blockquote lines', () => {
    const path = '/the-next-iteration-of-contraption-company'
    const blockquote =
      'In most cases the recipe for doing great work is simply: work hard on excitingly ambitious projects, and something good will come of it. - Paul Graham in "How to Do Great Work"'
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text: blockquote,
          path,
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({ text: blockquote, path })
  })
})

describe('toPlaintext', () => {
  it('unwraps escaped footnote links', () => {
    expect(toPlaintext('Great[\\[1\\]](#fn1)!')).toBe('Great[1]!')
  })

  it('preserves escaped Markdown punctuation as rendered text', () => {
    expect(toPlaintext('A \\*literal star and \\_underscore.')).toBe(
      'A *literal star and _underscore.'
    )
  })
})
