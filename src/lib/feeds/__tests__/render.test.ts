import { describe, expect, it } from 'vitest'
import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'
import {
  feedSummary,
  renderPostContentHtml,
  truncateAtSentenceBoundary,
} from '@/lib/feeds/render'

function makePost(content: string, description?: string): Post {
  return {
    slug: 'test-post',
    newsletter: 'workshop',
    frontmatter: {
      title: 'Test post',
      publishedAt: '2026-01-01',
      featured: false,
      draft: false,
      ...(description && { description }),
    },
    content,
    excerpt: description ?? content,
  }
}

describe('renderPostContentHtml', () => {
  it('renders semantic HTML without inline styles', async () => {
    const html = await renderPostContentHtml(
      makePost('## Heading\n\nSome **bold** text.\n\n- one\n- two')
    )
    expect(html).toContain('<h2>Heading</h2>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<ul>')
    expect(html).not.toContain('style=')
  })

  it('absolutizes relative links and image sources', async () => {
    const html = await renderPostContentHtml(
      makePost('[a post](/some-post) and ![alt text](/images/posts/pic.jpg)')
    )
    expect(html).toContain(`href="${siteConfig.url}/some-post"`)
    expect(html).toContain(`src="${siteConfig.url}/images/posts/pic.jpg"`)
  })

  it('keeps absolute URLs untouched', async () => {
    const html = await renderPostContentHtml(
      makePost('[external](https://example.com/page)')
    )
    expect(html).toContain('href="https://example.com/page"')
  })

  it('keeps images as plain img tags', async () => {
    const html = await renderPostContentHtml(
      makePost('![alt text](/images/posts/pic.jpg)')
    )
    expect(html).toContain('alt="alt text"')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('style=')
  })

  it('renders YouTube embeds as linked thumbnails without styles', async () => {
    const html = await renderPostContentHtml(
      makePost('Intro.\n\n<YouTubeEmbed video="dQw4w9WgXcQ" title="A video" />')
    )
    expect(html).toContain(
      'src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"'
    )
    expect(html).toContain('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(html).toContain('Watch on YouTube: A video')
    expect(html).not.toContain('style=')
    expect(html).not.toContain('%%bp-youtube-embed')
  })
})

describe('truncateAtSentenceBoundary', () => {
  it('returns short text unchanged', () => {
    expect(truncateAtSentenceBoundary('One sentence.', 100)).toBe(
      'One sentence.'
    )
  })

  it('cuts at the last sentence boundary that fits', () => {
    const text = 'First sentence. Second sentence. Third sentence goes long.'
    expect(truncateAtSentenceBoundary(text, 40)).toBe(
      'First sentence. Second sentence.'
    )
  })

  it('handles closing quotes after terminal punctuation', () => {
    const text = 'He said "stop." Then the story continued for a long while.'
    expect(truncateAtSentenceBoundary(text, 20)).toBe('He said "stop."')
  })

  it('falls back to a word boundary when no sentence fits', () => {
    const text =
      'A single very long sentence that never terminates within the limit at all'
    const result = truncateAtSentenceBoundary(text, 30)
    expect(result).toBe('A single very long sentence...')
    expect(result.length).toBeLessThanOrEqual(33)
  })
})

describe('feedSummary', () => {
  it('prefers the hand-written frontmatter description', () => {
    const post = makePost('Body text here.', 'A written summary.')
    expect(feedSummary(post)).toBe('A written summary.')
  })

  it('derives a sentence-bounded excerpt from the body', () => {
    const sentence = 'This sentence repeats to pad the excerpt out further. '
    const post = makePost(sentence.repeat(12).trim())
    const summary = feedSummary(post)
    expect(summary.length).toBeLessThanOrEqual(280)
    expect(summary.endsWith('.')).toBe(true)
  })
})
