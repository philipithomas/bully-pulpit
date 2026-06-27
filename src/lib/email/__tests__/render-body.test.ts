import { describe, expect, it } from 'vitest'
import { getPostsByNewsletter } from '@/lib/content/loader'
import type { Post } from '@/lib/content/types'
import { buildEmailBodyHtml } from '@/lib/email/render-body'

function makePost(content: string): Post {
  return {
    slug: 'youtube-embed-fixture',
    newsletter: 'workshop',
    frontmatter: {
      title: 'Fixture post',
      publishedAt: '2026-01-01',
      featured: false,
      draft: false,
    },
    content,
    excerpt: 'Fixture post.',
  }
}

describe('buildEmailBodyHtml with YouTube embeds', () => {
  const content = [
    'I made a video demo of the integration.',
    '<YouTubeEmbed video="FxZM4_SQH7w" title="Coding a Booklet AI feature" />',
    'More prose after the video.',
  ].join('\n\n')

  it('renders the embed as a linked thumbnail in the HTML part', async () => {
    const body = await buildEmailBodyHtml(makePost(content))
    expect(body.html).toContain(
      '<a href="https://www.youtube.com/watch?v=FxZM4_SQH7w"'
    )
    expect(body.html).toContain(
      '<img src="https://i.ytimg.com/vi/FxZM4_SQH7w/hqdefault.jpg"'
    )
    expect(body.html).toContain('width="480" height="360"')
    expect(body.html).toContain('Watch on YouTube: Coding a Booklet AI feature')
    expect(body.html).not.toContain('YouTubeEmbed')
    expect(body.html).not.toContain('%%bp-youtube-embed')
  })

  it('renders a watch line in the plaintext part, id intact', async () => {
    const body = await buildEmailBodyHtml(makePost(content))
    // The underscore in the id must survive markdownToPlaintext, which
    // strips _..._ emphasis pairs.
    expect(body.bodyText).toContain(
      'Watch on YouTube: https://www.youtube.com/watch?v=FxZM4_SQH7w'
    )
    expect(body.bodyText).toContain('More prose after the video.')
    expect(body.bodyText).not.toContain('%%bp-youtube-embed')
  })

  it('keeps the preheader preview free of watch URLs', async () => {
    const body = await buildEmailBodyHtml(makePost(content))
    expect(body.previewText).not.toContain('youtube.com')
    expect(body.previewText).toContain('I made a video demo')
  })

  it('handles multiple embeds in order', async () => {
    const multi = [
      'First.',
      '<YouTubeEmbed video="mVPXjn4K76k" title="One" />',
      'Second.',
      "<YouTubeEmbed video='-3muonMwiqY' />",
    ].join('\n\n')
    const body = await buildEmailBodyHtml(makePost(multi))
    const first = body.html.indexOf('mVPXjn4K76k')
    const second = body.html.indexOf('-3muonMwiqY')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(body.bodyText).toContain(
      'Watch on YouTube: https://www.youtube.com/watch?v=mVPXjn4K76k'
    )
    expect(body.bodyText).toContain(
      'Watch on YouTube: https://www.youtube.com/watch?v=-3muonMwiqY'
    )
  })

  it('is a no-op for posts without embeds', async () => {
    const body = await buildEmailBodyHtml(
      makePost('Just a paragraph with a [link](https://example.com).')
    )
    expect(body.html).not.toContain('ytimg')
    expect(body.html).not.toContain('Watch on YouTube')
    expect(body.bodyText).toBe(
      'Just a paragraph with a link (https://example.com).'
    )
  })
})

describe('buildEmailBodyHtml newsletter-specific blocks', () => {
  it('omits related posts from Tsundoku photo emails', async () => {
    const post = getPostsByNewsletter('tsundoku')[0]
    expect(post).toBeDefined()

    const body = await buildEmailBodyHtml(post)

    expect(body.html).not.toContain('Keep reading')
  })
})
