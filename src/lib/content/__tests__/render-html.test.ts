import { describe, expect, it } from 'vitest'
import { renderEmailHeaderHtml } from '@/lib/content/render-html'

describe('renderEmailHeaderHtml', () => {
  const siteUrl = 'https://www.philipithomas.com'

  it('renders title as linked h1', () => {
    const html = renderEmailHeaderHtml('My Post', siteUrl, 'my-post')
    expect(html).toContain('<h1')
    expect(html).toContain('href="https://www.philipithomas.com/my-post"')
    expect(html).toContain('My Post</a></h1>')
    expect(html).toContain('text-decoration: none')
    expect(html).toContain('text-align: center')
  })

  it('renders subtitle when provided', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      'A subtitle'
    )
    expect(html).toContain('A subtitle</p>')
    expect(html).toContain('Tiempos Text')
    expect(html).toContain('color: #625e58')
  })

  it('omits subtitle when null', () => {
    const html = renderEmailHeaderHtml('My Post', siteUrl, 'my-post', null)
    expect(html).not.toContain('A subtitle')
  })

  it('renders cover image with absolute URL for relative path', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      '/images/cover.jpg',
      'Cover alt'
    )
    expect(html).toContain(
      'src="https://www.philipithomas.com/images/cover.jpg"'
    )
    expect(html).toContain('alt="Cover alt"')
    expect(html).toContain('max-width: 100%')
  })

  it('renders cover image with absolute URL as-is', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      'https://cdn.example.com/img.jpg'
    )
    expect(html).toContain('src="https://cdn.example.com/img.jpg"')
  })

  it('uses title as alt when coverImageAlt is not provided', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      '/images/cover.jpg'
    )
    expect(html).toContain('alt="My Post"')
  })

  it('omits cover image when null', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      null
    )
    expect(html).not.toContain('<img')
  })

  it('includes spacer div', () => {
    const html = renderEmailHeaderHtml('My Post', siteUrl, 'my-post')
    expect(html).toContain('height: 24px')
    expect(html).toContain('&nbsp;')
  })

  it('always includes author byline as link', () => {
    const html = renderEmailHeaderHtml('My Post', siteUrl, 'my-post')
    expect(html).toContain('Philip I. Thomas</a>')
    expect(html).toContain('href="https://www.philipithomas.com"')
    expect(html).toContain('font-size: 14px')
    expect(html).toContain('font-weight: 500')
  })

  it('renders date when publishedAt provided', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      null,
      null,
      '2025-01-15'
    )
    expect(html).toContain('2025-01-15')
    expect(html).toContain('Sohne Mono')
    expect(html).toContain('text-transform: uppercase')
    expect(html).toContain('letter-spacing: 0.12em')
  })

  it('omits date when publishedAt is null', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      null,
      null,
      null
    )
    expect(html).not.toContain('Sohne Mono')
  })

  it('omits date when publishedAt is not provided', () => {
    const html = renderEmailHeaderHtml('My Post', siteUrl, 'my-post')
    expect(html).not.toContain('Sohne Mono')
  })

  it('renders all elements together', () => {
    const html = renderEmailHeaderHtml(
      'Full Post',
      siteUrl,
      'full-post',
      'The subtitle',
      '/images/hero.jpg',
      'Hero image',
      '2025-03-01'
    )
    expect(html).toContain('2025-03-01')
    expect(html).toContain('Full Post</a></h1>')
    expect(html).toContain('The subtitle</p>')
    expect(html).toContain('Philip I. Thomas</a>')
    expect(html).toContain(
      'src="https://www.philipithomas.com/images/hero.jpg"'
    )
    expect(html).toContain('alt="Hero image"')
  })
})
