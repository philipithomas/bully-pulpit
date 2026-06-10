import { describe, expect, it } from 'vitest'
import type { CorpusPost } from '@/lib/search/corpus'
import { buildLexicalIndex } from '@/lib/search/lexical'

function makeCorpusPost(
  slug: string,
  title: string,
  body: string[],
  extra: Partial<Pick<CorpusPost, 'description' | 'coverAlt'>> = {}
): CorpusPost {
  const chunks = [
    { seq: 0, kind: 'title' as const, text: title },
    ...body.map((text, i) => ({ seq: i + 1, kind: 'body' as const, text })),
  ]
  return {
    slug,
    title,
    url: `/${slug}`,
    newsletter: 'workshop',
    description: extra.description ?? '',
    coverImage: '',
    coverAlt: extra.coverAlt ?? '',
    chunks,
  }
}

describe('buildLexicalIndex', () => {
  it('ranks a title match above a body-only match', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('about-bicycles', 'Bicycles', [
        'A post about riding around the city.',
      ]),
      makeCorpusPost('commute-notes', 'Commute notes', [
        'I took my bicycles out twice this week.',
        'Bicycles are mentioned here again, and bicycles once more.',
      ]),
    ])
    const results = index.search('bicycles')
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].slug).toBe('about-bicycles')
  })

  it('prefix-matches the final token for typeahead', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('keyboards', 'Mechanical keyboards', [
        'Notes on switches.',
      ]),
    ])
    expect(index.search('mechanical keyb')[0]?.slug).toBe('keyboards')
    expect(index.search('keyb')[0]?.slug).toBe('keyboards')
  })

  it('requires all terms (AND) but falls back to OR on zero results', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('espresso', 'Espresso', ['Grinding coffee beans daily.']),
      makeCorpusPost('roasting', 'Roasting', ['Roasting coffee at home.']),
    ])
    // AND: only the post containing both terms
    const both = index.search('coffee grinding')
    expect(both).toHaveLength(1)
    expect(both[0].slug).toBe('espresso')
    // OR fallback: no post contains "zzzzzz", but coffee still matches
    const fallback = index.search('coffee zzzzzz')
    expect(fallback.length).toBeGreaterThan(0)
  })

  it('matches cover alt text', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('a-trip', 'A trip', ['We went somewhere.'], {
        coverAlt: 'A sailboat in the harbor at dusk',
      }),
    ])
    expect(index.search('sailboat')[0]?.slug).toBe('a-trip')
  })

  it('respects the limit and returns stored fields', () => {
    const posts = Array.from({ length: 15 }, (_, i) =>
      makeCorpusPost(`post-${i}`, `Post ${i}`, ['Shared keyword zebra here.'])
    )
    const index = buildLexicalIndex(posts)
    const results = index.search('zebra', 10)
    expect(results).toHaveLength(10)
    expect(results[0]).toMatchObject({
      url: `/${results[0].slug}`,
      newsletter: 'workshop',
    })
  })
})

describe('extractExcerpts', () => {
  it('returns short snippets around matched terms', () => {
    const long = `${'Filler words before the match. '.repeat(10)}The keyword zebra appears here in the middle. ${'Filler words after the match. '.repeat(10)}`
    const index = buildLexicalIndex([
      makeCorpusPost('zoo', 'Zoo visit', [long]),
    ])
    const [excerpt] = index.extractExcerpts('zoo', ['zebra'])
    expect(excerpt).toBeDefined()
    expect(excerpt.toLowerCase()).toContain('zebra')
    expect(excerpt.length).toBeLessThanOrEqual(140)
  })

  it('prefers distinct chunks for multiple excerpts', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('multi', 'Multi', [
        'First chunk mentions zebra once.',
        'Second chunk also mentions zebra.',
        'Third chunk has zebra too.',
      ]),
    ])
    const excerpts = index.extractExcerpts('multi', ['zebra'], 3)
    expect(excerpts).toHaveLength(3)
    expect(excerpts[0]).toContain('First chunk')
    expect(excerpts[1]).toContain('Second chunk')
    expect(excerpts[2]).toContain('Third chunk')
  })

  it('never extracts from the title chunk', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('titled', 'Zebra stripes', ['Body without the term.']),
    ])
    expect(index.extractExcerpts('titled', ['zebra'])).toEqual([])
  })

  it('returns at most the requested number of excerpts', () => {
    const index = buildLexicalIndex([
      makeCorpusPost('many', 'Many', [
        `zebra one. ${'pad '.repeat(60)} zebra two. ${'pad '.repeat(60)} zebra three. ${'pad '.repeat(60)} zebra four.`,
      ]),
    ])
    expect(
      index.extractExcerpts('many', ['zebra'], 2).length
    ).toBeLessThanOrEqual(2)
  })
})
