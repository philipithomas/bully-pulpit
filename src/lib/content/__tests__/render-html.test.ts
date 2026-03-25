import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllPosts } from '@/lib/content/loader'
import {
  markdownToPlaintext,
  renderEmailHeaderHtml,
  renderRelatedPostsHtml,
} from '@/lib/content/render-html'

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

  it('renders cover image with email-optimized URL for relative path', () => {
    const html = renderEmailHeaderHtml(
      'My Post',
      siteUrl,
      'my-post',
      null,
      '/images/covers/cover.jpg',
      'Cover alt'
    )
    expect(html).toContain(
      'src="https://www.philipithomas.com/images/email/covers/cover.jpg"'
    )
    expect(html).toContain('alt="Cover alt"')
    expect(html).toContain('width="600"')
    expect(html).toContain('max-width: 600px')
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
      '/images/covers/cover.jpg'
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
      '/images/covers/hero.jpg',
      'Hero image',
      '2025-03-01'
    )
    expect(html).toContain('2025-03-01')
    expect(html).toContain('Full Post</a></h1>')
    expect(html).toContain('The subtitle</p>')
    expect(html).toContain('Philip I. Thomas</a>')
    expect(html).toContain(
      'src="https://www.philipithomas.com/images/email/covers/hero.jpg"'
    )
    expect(html).toContain('alt="Hero image"')
  })
})

const EMAIL_COVERS_DIR = path.join(process.cwd(), 'public/images/email/covers')
const EMAIL_THUMBS_DIR = path.join(
  process.cwd(),
  'public/images/email/thumbnails'
)
const MAX_EMAIL_COVER_SIZE = 110 * 1024 // 110KB
const MAX_EMAIL_THUMB_SIZE = 15 * 1024 // 15KB

describe('email image variants', () => {
  const posts = getAllPosts()
  const postsWithCovers = posts.filter((p) => p.frontmatter.coverImage)

  it('every cover image has an email cover variant', () => {
    for (const post of postsWithCovers) {
      const basename = path.basename(post.frontmatter.coverImage!)
      const emailPath = path.join(EMAIL_COVERS_DIR, basename)
      expect(
        fs.existsSync(emailPath),
        `Missing email cover for ${post.slug}: ${emailPath}`
      ).toBe(true)
    }
  })

  it('every cover image has an email thumbnail variant', () => {
    for (const post of postsWithCovers) {
      const basename = path.basename(post.frontmatter.coverImage!)
      const thumbPath = path.join(EMAIL_THUMBS_DIR, basename)
      expect(
        fs.existsSync(thumbPath),
        `Missing email thumbnail for ${post.slug}: ${thumbPath}`
      ).toBe(true)
    }
  })

  it(`email cover variants are under ${MAX_EMAIL_COVER_SIZE / 1024}KB`, () => {
    for (const post of postsWithCovers) {
      const basename = path.basename(post.frontmatter.coverImage!)
      const emailPath = path.join(EMAIL_COVERS_DIR, basename)
      if (!fs.existsSync(emailPath)) continue
      const size = fs.statSync(emailPath).size
      expect(
        size,
        `Email cover too large for ${post.slug}: ${(size / 1024).toFixed(0)}KB > ${MAX_EMAIL_COVER_SIZE / 1024}KB`
      ).toBeLessThanOrEqual(MAX_EMAIL_COVER_SIZE)
    }
  })

  it(`email thumbnail variants are under ${MAX_EMAIL_THUMB_SIZE / 1024}KB`, () => {
    for (const post of postsWithCovers) {
      const basename = path.basename(post.frontmatter.coverImage!)
      const thumbPath = path.join(EMAIL_THUMBS_DIR, basename)
      if (!fs.existsSync(thumbPath)) continue
      const size = fs.statSync(thumbPath).size
      expect(
        size,
        `Email thumbnail too large for ${post.slug}: ${(size / 1024).toFixed(0)}KB > ${MAX_EMAIL_THUMB_SIZE / 1024}KB`
      ).toBeLessThanOrEqual(MAX_EMAIL_THUMB_SIZE)
    }
  })
})

describe('renderRelatedPostsHtml', () => {
  const siteUrl = 'https://www.philipithomas.com'

  it('uses email thumbnail paths for cover images', () => {
    const posts = getAllPosts().filter((p) => p.frontmatter.coverImage)
    if (posts.length === 0) return
    const html = renderRelatedPostsHtml(posts.slice(0, 3), siteUrl)
    expect(html).toContain('/images/email/thumbnails/')
    expect(html).not.toMatch(
      /src="https:\/\/www\.philipithomas\.com\/images\/covers\//
    )
  })
})

describe('markdownToPlaintext', () => {
  it('strips markdown links', () => {
    expect(markdownToPlaintext('[click here](https://example.com)')).toBe(
      'click here'
    )
  })

  it('strips images', () => {
    expect(markdownToPlaintext('![alt text](image.jpg) hello')).toBe('hello')
  })

  it('strips headings', () => {
    expect(markdownToPlaintext('## My Heading\nSome text')).toBe(
      'My Heading Some text'
    )
  })

  it('strips bold and italic', () => {
    expect(markdownToPlaintext('**bold** and *italic*')).toBe('bold and italic')
  })

  it('collapses whitespace', () => {
    expect(markdownToPlaintext('First paragraph.\n\nSecond paragraph.')).toBe(
      'First paragraph. Second paragraph.'
    )
  })

  it('truncates to maxLength', () => {
    const long = 'a'.repeat(200)
    expect(markdownToPlaintext(long, 100)).toHaveLength(100)
  })

  it('defaults to 150 chars', () => {
    const long = 'a'.repeat(200)
    expect(markdownToPlaintext(long)).toHaveLength(150)
  })
})
