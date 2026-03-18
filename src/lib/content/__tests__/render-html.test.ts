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
  })

  it('renders subtitle when provided', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      'A subtitle'
    )
    expect(html).toContain('A subtitle</p>')
    expect(html).toContain('color: #7E7A73')
  })

  it('omits subtitle when null', () => {
    const html = renderEmailHeaderHtml('My Post', siteUrl, 'my-post', null)
    expect(html).not.toContain('</p>')
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

  it('renders all elements together', () => {
    const html = renderEmailHeaderHtml(
      'Full Post',
      siteUrl,
      'full-post',
      'The subtitle',
      '/images/hero.jpg',
      'Hero image'
    )
    expect(html).toContain('Full Post</a></h1>')
    expect(html).toContain('The subtitle</p>')
    expect(html).toContain(
      'src="https://www.philipithomas.com/images/hero.jpg"'
    )
    expect(html).toContain('alt="Hero image"')
  })
})
