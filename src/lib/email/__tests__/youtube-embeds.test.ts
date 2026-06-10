import { describe, expect, it } from 'vitest'
import { renderMarkdownToHtml } from '@/lib/content/render-html'
import {
  extractYouTubeEmbeds,
  extractYouTubeVideoId,
  restoreYouTubeEmbedsAsHtml,
  restoreYouTubeEmbedsAsText,
} from '@/lib/email/youtube-embeds'

describe('extractYouTubeVideoId', () => {
  it('accepts a bare video id', () => {
    expect(extractYouTubeVideoId('mVPXjn4K76k')).toBe('mVPXjn4K76k')
  })

  it('accepts ids containing hyphens and underscores', () => {
    expect(extractYouTubeVideoId('-3muonMwiqY')).toBe('-3muonMwiqY')
    expect(extractYouTubeVideoId('FxZM4_SQH7w')).toBe('FxZM4_SQH7w')
  })

  it('normalizes youtu.be URLs', () => {
    expect(extractYouTubeVideoId('https://youtu.be/mVPXjn4K76k')).toBe(
      'mVPXjn4K76k'
    )
    expect(extractYouTubeVideoId('https://youtu.be/mVPXjn4K76k?t=30')).toBe(
      'mVPXjn4K76k'
    )
  })

  it('normalizes youtube.com watch URLs', () => {
    expect(
      extractYouTubeVideoId('https://www.youtube.com/watch?v=mVPXjn4K76k&t=30s')
    ).toBe('mVPXjn4K76k')
    expect(
      extractYouTubeVideoId('https://m.youtube.com/watch?v=FxZM4_SQH7w')
    ).toBe('FxZM4_SQH7w')
  })

  it('normalizes embed, shorts, and live URLs', () => {
    expect(
      extractYouTubeVideoId('https://www.youtube.com/embed/mVPXjn4K76k')
    ).toBe('mVPXjn4K76k')
    expect(
      extractYouTubeVideoId('https://youtube.com/shorts/-3muonMwiqY')
    ).toBe('-3muonMwiqY')
    expect(
      extractYouTubeVideoId('https://www.youtube.com/live/mVPXjn4K76k')
    ).toBe('mVPXjn4K76k')
  })

  it('rejects values that yield no safe id', () => {
    expect(extractYouTubeVideoId('')).toBeNull()
    expect(extractYouTubeVideoId('not a video')).toBeNull()
    expect(extractYouTubeVideoId('abc')).toBeNull()
    expect(
      extractYouTubeVideoId('https://example.com/watch?v=mVPXjn4K76k')
    ).toBeNull()
    expect(extractYouTubeVideoId('javascript:alert(1)')).toBeNull()
  })
})

describe('extractYouTubeEmbeds', () => {
  it('replaces a double-quoted embed tag with a token', () => {
    const source =
      'Intro.\n\n<YouTubeEmbed video="mVPXjn4K76k" title="Stripe Projects demo" />\n\nOutro.'
    const { markdown, embeds } = extractYouTubeEmbeds(source)
    expect(embeds).toEqual([
      {
        token: '%%bp-youtube-embed-0%%',
        videoId: 'mVPXjn4K76k',
        title: 'Stripe Projects demo',
      },
    ])
    expect(markdown).toBe('Intro.\n\n%%bp-youtube-embed-0%%\n\nOutro.')
  })

  it('handles single quotes, extra props, and a missing title', () => {
    const { markdown, embeds } = extractYouTubeEmbeds(
      "<YouTubeEmbed className='wide' video='-3muonMwiqY' data-x='1' />"
    )
    expect(embeds).toEqual([
      { token: '%%bp-youtube-embed-0%%', videoId: '-3muonMwiqY', title: null },
    ])
    expect(markdown).toBe('%%bp-youtube-embed-0%%')
  })

  it('handles an explicit closing tag', () => {
    const { markdown, embeds } = extractYouTubeEmbeds(
      '<YouTubeEmbed video="abc123xyz"></YouTubeEmbed>'
    )
    expect(embeds[0]?.videoId).toBe('abc123xyz')
    expect(markdown).toBe('%%bp-youtube-embed-0%%')
  })

  it('normalizes URL-valued video props', () => {
    const { embeds } = extractYouTubeEmbeds(
      '<YouTubeEmbed video="https://youtu.be/FxZM4_SQH7w" title="A walkthrough" />'
    )
    expect(embeds[0]?.videoId).toBe('FxZM4_SQH7w')
  })

  it('handles multiple embeds in one post', () => {
    const source = [
      'First.',
      '<YouTubeEmbed video="mVPXjn4K76k" title="One" />',
      'Second.',
      '<YouTubeEmbed video="-3muonMwiqY" title="Two" />',
    ].join('\n\n')
    const { markdown, embeds } = extractYouTubeEmbeds(source)
    expect(embeds.map((e) => e.videoId)).toEqual(['mVPXjn4K76k', '-3muonMwiqY'])
    expect(markdown).toBe(
      'First.\n\n%%bp-youtube-embed-0%%\n\nSecond.\n\n%%bp-youtube-embed-1%%'
    )
  })

  it('is a no-op for markdown without embeds', () => {
    const source = '# Title\n\nSome [link](https://example.com) and `code`.'
    const { markdown, embeds } = extractYouTubeEmbeds(source)
    expect(markdown).toBe(source)
    expect(embeds).toEqual([])
  })

  it('leaves tags without a usable video id untouched', () => {
    const broken = '<YouTubeEmbed video="???" />\n\n<YouTubeEmbed title="x" />'
    const { markdown, embeds } = extractYouTubeEmbeds(broken)
    expect(markdown).toBe(broken)
    expect(embeds).toEqual([])
  })
})

describe('restoreYouTubeEmbedsAsHtml', () => {
  const embed = {
    token: '%%bp-youtube-embed-0%%',
    videoId: 'mVPXjn4K76k',
    title: 'Stripe Projects demo',
  }

  it('replaces a token paragraph with a linked thumbnail and caption', () => {
    const html = restoreYouTubeEmbedsAsHtml(
      '<p style="x">%%bp-youtube-embed-0%%</p>',
      [embed]
    )
    expect(html).toContain(
      '<a href="https://www.youtube.com/watch?v=mVPXjn4K76k"'
    )
    expect(html).toContain(
      'src="https://i.ytimg.com/vi/mVPXjn4K76k/hqdefault.jpg"'
    )
    expect(html).toContain('width="480" height="360"')
    expect(html).toContain('max-width: 600px')
    expect(html).toContain('Watch on YouTube: Stripe Projects demo')
    expect(html).not.toContain('%%bp-youtube-embed-0%%')
    expect(html).not.toContain('<p style="x">')
  })

  it('replaces a bare token when it is not its own paragraph', () => {
    const html = restoreYouTubeEmbedsAsHtml(
      '<p>Watch %%bp-youtube-embed-0%% now</p>',
      [embed]
    )
    expect(html).toContain('hqdefault.jpg')
    expect(html).not.toContain('%%bp-youtube-embed-0%%')
  })

  it('escapes the title in the alt text and caption', () => {
    const html = restoreYouTubeEmbedsAsHtml('%%bp-youtube-embed-0%%', [
      {
        token: '%%bp-youtube-embed-0%%',
        videoId: 'abc123xyz',
        title: `Tom & Jerry's "best"`,
      },
    ])
    expect(html).toContain('alt="Tom &amp; Jerry&#39;s &quot;best&quot;"')
    expect(html).toContain(
      'Watch on YouTube: Tom &amp; Jerry&#39;s &quot;best&quot;'
    )
  })

  it('uses a generic caption when the embed has no title', () => {
    const html = restoreYouTubeEmbedsAsHtml('%%bp-youtube-embed-0%%', [
      { token: '%%bp-youtube-embed-0%%', videoId: 'abc123xyz', title: null },
    ])
    expect(html).toContain('>Watch on YouTube</a>')
    expect(html).toContain('alt="YouTube video"')
  })
})

describe('restoreYouTubeEmbedsAsText', () => {
  it('replaces each token with a watch line', () => {
    const text = restoreYouTubeEmbedsAsText(
      'Intro.\n\n%%bp-youtube-embed-0%%\n\n%%bp-youtube-embed-1%%',
      [
        { token: '%%bp-youtube-embed-0%%', videoId: 'mVPXjn4K76k', title: 'A' },
        { token: '%%bp-youtube-embed-1%%', videoId: 'FxZM4_SQH7w', title: 'B' },
      ]
    )
    expect(text).toBe(
      'Intro.\n\nWatch on YouTube: https://www.youtube.com/watch?v=mVPXjn4K76k\n\nWatch on YouTube: https://www.youtube.com/watch?v=FxZM4_SQH7w'
    )
  })
})

describe('email markdown pipeline with embeds', () => {
  it('the generated markup survives the sanitizing pipeline (snapshot)', async () => {
    const { markdown, embeds } = extractYouTubeEmbeds(
      'Take a look:\n\n<YouTubeEmbed video="mVPXjn4K76k" title="Stripe Projects demo" />'
    )
    const html = restoreYouTubeEmbedsAsHtml(
      await renderMarkdownToHtml(markdown),
      embeds
    )
    expect(html).toMatchInlineSnapshot(`
      "<p style="font-family: &#x27;Tiempos Text&#x27;, Georgia, &#x27;Times New Roman&#x27;, serif; font-size: 17px; font-weight: 400; color: #3b3834; line-height: 1.7; margin: 0 0 16px;">Take a look:</p>
      <p style="margin: 0 0 8px;"><a href="https://www.youtube.com/watch?v=mVPXjn4K76k" style="display: block; text-decoration: none;"><img src="https://i.ytimg.com/vi/mVPXjn4K76k/hqdefault.jpg" alt="Stripe Projects demo" width="480" height="360" style="width: 100%; max-width: 600px; height: auto; display: block;"></a></p><p style="font-family: 'Tiempos Text', Georgia, 'Times New Roman', serif; font-size: 15px; color: #625e58; line-height: 1.5; margin: 0 0 16px;"><a href="https://www.youtube.com/watch?v=mVPXjn4K76k" style="color: inherit; text-decoration: underline; text-decoration-color: #b1ada6;">Watch on YouTube: Stripe Projects demo</a></p>"
    `)
  })
})
