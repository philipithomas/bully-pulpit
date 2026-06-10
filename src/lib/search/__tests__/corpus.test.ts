import { describe, expect, it } from 'vitest'
import type { Post } from '@/lib/content/types'
import {
  buildCorpus,
  chunkPost,
  MAX_CHUNK_CHARS,
  stripToPlaintext,
} from '@/lib/search/corpus'

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    slug: 'test-post',
    newsletter: 'workshop',
    frontmatter: {
      title: 'Test post',
      publishedAt: '2026-01-01',
      featured: false,
      draft: false,
    },
    content: 'Hello world.',
    excerpt: 'Hello world.',
    ...overrides,
  } as Post
}

describe('stripToPlaintext', () => {
  it('strips markdown syntax but keeps content', () => {
    const input =
      '## A heading\n\nSome **bold** and *italic* text with `inline code` and a [link](https://example.com).'
    expect(stripToPlaintext(input)).toBe(
      'A heading Some bold and italic text with inline code and a link.'
    )
  })

  it('strips MDX/JSX tags and keeps image alt text', () => {
    const input =
      '<Aside>Note text</Aside>\n\n![A photo of a desk](/images/desk.jpg)'
    expect(stripToPlaintext(input)).toBe('Note text A photo of a desk')
  })
})

describe('chunkPost', () => {
  it('is deterministic: identical input yields identical chunks', () => {
    const post = makePost({
      content: Array.from(
        { length: 30 },
        (_, i) => `Paragraph ${i} with some words in it.`
      ).join('\n\n'),
    })
    const a = chunkPost(post)
    const b = chunkPost(post)
    expect(a).toEqual(b)
  })

  it('starts with a title chunk combining title and subtitle', () => {
    const post = makePost({
      frontmatter: {
        title: 'My title',
        subtitle: 'A subtitle',
        publishedAt: '2026-01-01',
        featured: false,
        draft: false,
      },
    })
    const chunks = chunkPost(post)
    expect(chunks[0]).toEqual({
      seq: 0,
      kind: 'title',
      text: 'My title. A subtitle',
    })
  })

  it('falls back to description when subtitle is absent', () => {
    const post = makePost({
      frontmatter: {
        title: 'My title',
        description: 'A description',
        publishedAt: '2026-01-01',
        featured: false,
        draft: false,
      },
    })
    expect(chunkPost(post)[0].text).toBe('My title. A description')
  })

  it('groups paragraphs into chunks of roughly the size limit', () => {
    const paragraph = 'word '.repeat(60).trim() // ~300 chars
    const post = makePost({
      content: Array.from({ length: 20 }, () => paragraph).join('\n\n'),
    })
    const body = chunkPost(post).filter((c) => c.kind === 'body')
    expect(body.length).toBeGreaterThan(1)
    for (const chunk of body) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
    }
  })

  it('keeps heading text with the content it introduces', () => {
    const filler = 'filler '.repeat(160).trim() // > 1200 chars, forces a break
    const post = makePost({
      content: `Intro paragraph.\n\n${filler}\n\n## Section two\n\nSection two body text.`,
    })
    const body = chunkPost(post).filter((c) => c.kind === 'body')
    const sectionChunk = body.find((c) => c.text.includes('Section two body'))
    expect(sectionChunk).toBeDefined()
    expect(sectionChunk!.text).toContain('Section two')
    expect(sectionChunk!.text.indexOf('Section two')).toBeLessThan(
      sectionChunk!.text.indexOf('Section two body')
    )
  })

  it('adds a cover-alt chunk when coverImageAlt exists', () => {
    const post = makePost({
      frontmatter: {
        title: 'My title',
        coverImage: '/images/covers/x.jpg',
        coverImageAlt: 'A red bicycle leaning on a wall',
        publishedAt: '2026-01-01',
        featured: false,
        draft: false,
      },
    })
    const chunks = chunkPost(post)
    const last = chunks[chunks.length - 1]
    expect(last.kind).toBe('cover-alt')
    expect(last.text).toBe('A red bicycle leaning on a wall')
  })

  it('assigns sequential seq values starting at 0', () => {
    const post = makePost({
      content: 'One.\n\nTwo.\n\nThree.',
    })
    const chunks = chunkPost(post)
    expect(chunks.map((c) => c.seq)).toEqual(chunks.map((_, i) => i))
  })

  it('keeps fenced code blocks as searchable text without fence markers', () => {
    const post = makePost({
      content: 'Run this:\n\n```bash\npnpm search:index\n\npnpm build\n```',
    })
    const body = chunkPost(post).filter((c) => c.kind === 'body')
    const all = body.map((c) => c.text).join('\n')
    expect(all).toContain('pnpm search:index')
    expect(all).not.toContain('```')
    expect(all).not.toContain('bash\n')
  })
})

describe('buildCorpus', () => {
  it('is stable across runs over the real content', () => {
    const a = buildCorpus()
    const b = buildCorpus()
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(50)
    for (const post of a) {
      expect(post.chunks[0].kind).toBe('title')
      expect(post.url).toBe(`/${post.slug}`)
    }
  })
})
