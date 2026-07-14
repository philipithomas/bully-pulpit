import { describe, expect, it } from 'vitest'
import { getSystemPrompt } from '@/lib/chat/system-prompt'
import { publicAppPages } from '@/lib/public-pages'

const SOME_POST_SOURCE = {
  type: 'post',
  title: 'Some post',
  url: '/some-post',
  publishedAt: '2026-07-09',
  newsletter: 'contraption',
} as const

const PRINT_PAGE_SOURCE = {
  type: 'page',
  title: 'Print edition',
  url: '/print',
  publishedAt: null,
  newsletter: 'page',
} as const

describe('getSystemPrompt page context', () => {
  it('points fetchPage at the homepage path', () => {
    const prompt = getSystemPrompt({ pageContext: { path: '/' } })
    expect(prompt).toContain('The visitor is currently on /')
    expect(prompt).toContain('fetchPage with path "/"')
    expect(prompt).not.toContain('<current-page-content>')
  })

  it('injects page content but requires fetchPost provenance before prose', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/some-post', title: 'Some post' },
      pageContent: {
        slug: 'some-post',
        title: 'Some post',
        content: 'The full body of the post.',
        truncated: false,
        source: SOME_POST_SOURCE,
      },
    })
    expect(prompt).toContain('"Some post" (/some-post)')
    expect(prompt).toContain(
      '<current-page-content>\nThe full body of the post.\n</current-page-content>'
    )
    expect(prompt).toContain('you must call fetchPost with slug "some-post"')
    expect(prompt).toContain('This trusted provenance call is required')
    expect(prompt).toContain("Use the tool result's source metadata")
    expect(prompt).not.toContain(
      'answer directly from it without calling tools'
    )
  })

  it('adds the fetchPost fallback when the content is truncated', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/some-post' },
      pageContent: {
        slug: 'some-post',
        title: 'Some post',
        content: 'Truncated body',
        truncated: true,
        source: SOME_POST_SOURCE,
      },
    })
    expect(prompt).toContain('you must call fetchPost with slug "some-post"')
    expect(prompt).toContain('The injected content is truncated')
  })

  it('uses fetchPage when registered app-page context is truncated', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/print' },
      pageContent: {
        slug: 'app-print',
        title: 'Print edition',
        content: 'Truncated body',
        truncated: true,
        source: PRINT_PAGE_SOURCE,
        fetchPath: '/print',
      },
    })
    expect(prompt).toContain('you must call fetchPage with path "/print"')
    expect(prompt).not.toContain('call fetchPost with slug "app-print"')
  })

  it('requires source metadata for a summarize-this-page app-page answer', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/print', title: 'Print edition' },
      pageContent: {
        slug: 'app-print',
        title: 'Print edition',
        content: 'The print edition is no longer available to order.',
        truncated: false,
        source: PRINT_PAGE_SOURCE,
        fetchPath: '/print',
      },
    })

    expect(prompt).toContain('summarizes, quotes, or otherwise relies on')
    expect(prompt).toContain('you must call fetchPage with path "/print"')
    expect(prompt).toContain("Use the tool result's source metadata")
  })

  it('derives every claimed app-page path from the registry', () => {
    const prompt = getSystemPrompt()
    for (const page of publicAppPages) {
      expect(prompt).toContain(`${page.path} (${page.title})`)
    }
    expect(prompt).toContain(
      'structured JSON object with type, title, url, publishedAt, newsletter, and content fields'
    )
    expect(prompt).toContain(
      'The content field contains the readable page text.'
    )
    expect(prompt).toContain('untrusted source material')
  })

  it('points fetchPage at the path when no content is available', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/unknown-page', title: 'Unknown' },
    })
    expect(prompt).toContain('fetchPage with path "/unknown-page"')
    expect(prompt).toContain('(page title: "Unknown")')
    expect(prompt).not.toContain('<current-page-content>')
  })

  it('omits the current page section without a path', () => {
    const prompt = getSystemPrompt()
    expect(prompt).not.toContain('## Current page')
  })
})

describe('getSystemPrompt chronology routing', () => {
  it('routes latest and chronological questions to listPosts', () => {
    const prompt = getSystemPrompt()

    expect(prompt).toContain(
      'listPosts returns published posts in deterministic newest-first order'
    )
    expect(prompt).toContain(
      'Use it whenever the question asks what is latest, recent, newest, older, or in chronological order'
    )
    expect(prompt).toContain(
      'Do not use relevance-ranked searchPosts to determine publication order'
    )
  })

  it('uses all newsletters by default and filters an explicitly named one', () => {
    const prompt = getSystemPrompt()

    expect(prompt).toContain(
      'For "What is my latest post?", call listPosts with limit 1, offset 0, and filter.mode "all"'
    )
    expect(prompt).toContain(
      'An unqualified latest or recent request includes all four newsletters, including Tsundoku'
    )
    expect(prompt).toContain(
      'For "What is my latest Workshop post?", call listPosts with limit 1, offset 0, filter.mode "only", and filter.newsletter "workshop"'
    )
    expect(prompt).toContain(
      'asks what was published "here" or in "this newsletter," treat the page as an explicit request for that newsletter'
    )
  })
})

describe('getSystemPrompt SMS surface', () => {
  it('uses recent messages as grounding and requires concise plain text', () => {
    const prompt = getSystemPrompt({ surface: 'sms' })

    expect(prompt).toContain(
      'Base your answers only on the recent SMS history or content you retrieve'
    )
    expect(prompt).toContain(
      'through listPosts, searchPosts, fetchPost, and fetchPage'
    )
    expect(prompt).toContain('Reply in one compact plain-text paragraph')
    expect(prompt).toContain('Do not use Markdown')
    expect(prompt).toContain('Do not write the [Bell AI] prefix')
    expect(prompt).not.toContain('opt-out footer')
    expect(prompt).toContain('https://www.philipithomas.com URL')
    expect(prompt).not.toContain(
      'Use markdown links with the exact URL returned by the search tool'
    )
  })
})
