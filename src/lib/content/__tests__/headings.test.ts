import { describe, expect, it } from 'vitest'
import { extractHeadings, stripCodeFences } from '@/lib/content/headings'
import { getAllPosts } from '@/lib/content/loader'

describe('stripCodeFences', () => {
  it('removes fenced blocks including the fence lines', () => {
    const md = 'before\n```bash\n# not a heading\necho hi\n```\nafter'
    expect(stripCodeFences(md)).toBe('before\nafter')
  })

  it('handles tilde fences', () => {
    const md = 'a\n~~~\n## inside\n~~~\nb'
    expect(stripCodeFences(md)).toBe('a\nb')
  })

  it('treats an unclosed fence as running to the end', () => {
    const md = 'a\n```\n## inside\nstill inside'
    expect(stripCodeFences(md)).toBe('a')
  })

  it('does not close a backtick fence with a tilde fence', () => {
    const md = 'a\n```\n~~~\n## inside\n```\nb'
    expect(stripCodeFences(md)).toBe('a\nb')
  })
})

describe('extractHeadings', () => {
  it('returns h2 and h3 headings with depth, text, and slug', () => {
    const md = '## Background\n\nProse.\n\n### The details\n\nMore prose.'
    expect(extractHeadings(md)).toEqual([
      { depth: 2, text: 'Background', slug: 'background' },
      { depth: 3, text: 'The details', slug: 'the-details' },
    ])
  })

  it('excludes h1 and h4 from the result but counts them for dedup', () => {
    const md = '# Intro\n\n## Intro\n\n#### Intro\n\n### Intro'
    expect(extractHeadings(md)).toEqual([
      { depth: 2, text: 'Intro', slug: 'intro-2' },
      { depth: 3, text: 'Intro', slug: 'intro-4' },
    ])
  })

  it('ignores headings inside code fences', () => {
    const md = '## Real\n\n```sh\n## commented out\n```\n\n## Also real'
    expect(extractHeadings(md).map((h) => h.slug)).toEqual([
      'real',
      'also-real',
    ])
  })

  it('cleans inline markdown from heading text', () => {
    const md =
      '## **Photo**\n\n## [Booklet](https://booklet.group)\n\n## The `config` file'
    expect(extractHeadings(md)).toEqual([
      { depth: 2, text: 'Photo', slug: 'photo' },
      { depth: 2, text: 'Booklet', slug: 'booklet' },
      { depth: 2, text: 'The config file', slug: 'the-config-file' },
    ])
  })

  it('deduplicates repeated headings with -2 suffixes', () => {
    const md = '## Notes\n\n## Notes'
    expect(extractHeadings(md).map((h) => h.slug)).toEqual(['notes', 'notes-2'])
  })

  it('requires whitespace after the hashes', () => {
    expect(extractHeadings('##NotAHeading')).toEqual([])
  })

  it('skips headings whose text slugs to nothing', () => {
    expect(extractHeadings('## ✨\n\n## Real')).toEqual([
      { depth: 2, text: 'Real', slug: 'real' },
    ])
  })
})

describe('real content', () => {
  it('produces unique, non-empty slugs within every post', () => {
    for (const post of getAllPosts()) {
      const slugs = extractHeadings(post.content).map((h) => h.slug)
      expect(slugs.every((s) => s.length > 0)).toBe(true)
      expect(new Set(slugs).size).toBe(slugs.length)
    }
  })
})
