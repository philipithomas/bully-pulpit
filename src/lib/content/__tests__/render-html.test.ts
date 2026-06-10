import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { getAllPosts } from '@/lib/content/loader'
import {
  markdownToPlaintext,
  renderEmailHeaderHtml,
  renderMarkdownToHtml,
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

describe('renderMarkdownToHtml', () => {
  it('inlines sans-serif font on headings', async () => {
    const html = await renderMarkdownToHtml('## Plans for May')
    expect(html).toMatch(/<h2[^>]*style="[^"]*Sohne/)
    expect(html).not.toMatch(/<h2[^>]*style="[^"]*Tiempos/)
  })

  it('inlines serif font on paragraphs and list items', async () => {
    const html = await renderMarkdownToHtml('A paragraph.\n\n- one\n- two')
    expect(html).toMatch(/<p[^>]*style="[^"]*Tiempos Text/)
    expect(html).toMatch(/<li[^>]*style="[^"]*Tiempos Text/)
  })

  it('inlines mono font on inline code but not on code inside pre', async () => {
    const html = await renderMarkdownToHtml(
      'Use `npm` here.\n\n```\nblock code\n```'
    )
    expect(html).toMatch(
      /<code[^>]*style="[^"]*Sohne Mono[^"]*background: #eceae6/
    )
    expect(html).toMatch(/<pre[^>]*style="[^"]*Sohne Mono/)
    expect(html).toMatch(
      /<code[^>]*style="[^"]*background: transparent[^"]*">block code/
    )
  })

  it('inlines style on links', async () => {
    const html = await renderMarkdownToHtml(
      'See [Chroma](https://trychroma.com).'
    )
    expect(html).toMatch(/<a[^>]*style="[^"]*text-decoration: underline/)
  })

  it('rewrites in-article post images to their email variants', async () => {
    const html = await renderMarkdownToHtml(
      '![A photo](/images/posts/october-2023/IMG_9933.JPG)'
    )
    expect(html).toContain(
      'src="/images/email/posts/october-2023/IMG_9933.JPG"'
    )
    expect(html).not.toContain('src="/images/posts/')
  })

  it('leaves external and non-pipeline image srcs untouched', async () => {
    const html = await renderMarkdownToHtml(
      '![ext](https://cdn.example.com/img.jpg)\n\n![gif](/images/posts/launching-booklet/wall-street.gif)'
    )
    expect(html).toContain('src="https://cdn.example.com/img.jpg"')
    expect(html).toContain(
      'src="/images/posts/launching-booklet/wall-street.gif"'
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

  it('strips MDX component and raw HTML tags', () => {
    expect(
      markdownToPlaintext(
        'Watch this:\n\n<YouTubeEmbed video="abc123" title="A talk" />\n\nGreat, right?'
      )
    ).toBe('Watch this: Great, right?')
    expect(markdownToPlaintext('<em>hi</em> there')).toBe('hi there')
  })

  it('keeps link URLs in the full text/plain body (preserveParagraphs)', () => {
    expect(
      markdownToPlaintext('See [the tool](https://example.com/tool).', 1000, {
        preserveParagraphs: true,
      })
    ).toBe('See the tool (https://example.com/tool).')
  })

  it('still drops link URLs in preview snippets', () => {
    expect(
      markdownToPlaintext('See [the tool](https://example.com/tool).')
    ).toBe('See the tool.')
  })

  it('keeps paragraph breaks in preserveParagraphs mode', () => {
    expect(
      markdownToPlaintext('First   paragraph.\n\nSecond\nparagraph.', 1000, {
        preserveParagraphs: true,
      })
    ).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('keeps inline code content midsentence', () => {
    expect(markdownToPlaintext('Run `brew install asdf` now.')).toBe(
      'Run brew install asdf now.'
    )
    expect(
      markdownToPlaintext('Run `brew install asdf` now.', 1000, {
        preserveParagraphs: true,
      })
    ).toBe('Run brew install asdf now.')
  })

  it('keeps fenced code blocks as indented blocks in the full text/plain body', () => {
    const markdown = [
      'Install it:',
      '```bash\nbrew install asdf\nasdf plugin add nodejs\n```',
      'Then restart your shell.',
    ].join('\n\n')
    expect(
      markdownToPlaintext(markdown, 1000, { preserveParagraphs: true })
    ).toBe(
      [
        'Install it:',
        '    brew install asdf\n    asdf plugin add nodejs',
        'Then restart your shell.',
      ].join('\n\n')
    )
  })

  it('drops fenced code blocks from preview snippets without eating surrounding prose', () => {
    expect(
      markdownToPlaintext('Before.\n\n```js\nconst x = 1\n```\n\nAfter.')
    ).toBe('Before. After.')
  })

  it('makes root-relative link targets absolute in the full text/plain body', () => {
    expect(
      markdownToPlaintext('Read [the post](/chroma) next.', 1000, {
        preserveParagraphs: true,
      })
    ).toBe('Read the post (https://www.philipithomas.com/chroma) next.')
  })

  it('leaves absolute and protocol-relative link targets untouched', () => {
    expect(
      markdownToPlaintext(
        '[a](https://example.com) and [b](//cdn.example.com/x)',
        1000,
        { preserveParagraphs: true }
      )
    ).toBe('a (https://example.com) and b (//cdn.example.com/x)')
  })

  // Real markup: Ghost-migration footnotes carry escaped brackets in the
  // link text ([\[1\]](#fn1)), which the general link pattern cannot match,
  // so the raw markdown used to leak into the text/plain part verbatim.
  describe('Ghost-migration footnote markup', () => {
    // From content/contraption/2025-02-21-rails-versus-nextjs.mdx.
    const post = [
      'In our increasingly complex world, many people return to vinyl because it offers simplicity, stability, and longevity[\\[1\\]](#fn1).',
      '',
      '1.  [Taylor Swift helps](https://www.forbes.com/sites/hughmcintyre/2025/02/18/taylor-swift-dominates-every-other-artist-as-the-global-queen-of-vinyl-sales/), too. [↩︎](#fnref1)',
    ].join('\n')

    it('keeps the visible footnote text and drops the dead fragment URL', () => {
      const text = markdownToPlaintext(post, 100_000, {
        preserveParagraphs: true,
      })
      expect(text).toContain('longevity[1].')
      expect(text).not.toContain('#fn')
      expect(text).not.toContain('\\[')
      // The real link in the footnote body keeps its URL.
      expect(text).toContain(
        'Taylor Swift helps (https://www.forbes.com/sites/hughmcintyre/2025/02/18/taylor-swift-dominates-every-other-artist-as-the-global-queen-of-vinyl-sales/), too. ↩︎'
      )
    })

    it('keeps preview snippets free of footnote markup', () => {
      const preview = markdownToPlaintext(post, 500)
      expect(preview).toContain('longevity[1].')
      expect(preview).not.toContain('#fn')
      expect(preview).not.toContain('\\[')
    })

    it('unwraps the footnote backlink', () => {
      expect(markdownToPlaintext('Thanks. [↩︎](#fnref1)', 500)).toBe('Thanks. ↩︎')
    })
  })
})
