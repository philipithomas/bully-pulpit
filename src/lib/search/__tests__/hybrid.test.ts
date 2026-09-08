import { describe, expect, it, vi } from 'vitest'
import { embedQuery } from '@/lib/search/embedding'
import {
  DEFAULT_QUERY_EMBEDDING_TIMEOUT_MS,
  HYBRID_SEARCH_WEIGHTS,
  hybridSearchPosts,
} from '@/lib/search/hybrid'

vi.mock('@/lib/search/embedding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/embedding')>()
  return {
    ...actual,
    embedQuery: vi.fn(async () => {
      throw new Error('no network in tests')
    }),
  }
})

describe('hybridSearchPosts', () => {
  it('uses the requested 70/30 BM25/vector weighting', () => {
    expect(HYBRID_SEARCH_WEIGHTS).toEqual({ lexical: 0.7, vector: 0.3 })
  })

  it('uses an embedding timeout that keeps typeahead responsive', () => {
    expect(DEFAULT_QUERY_EMBEDDING_TIMEOUT_MS).toBe(800)
  })

  it('falls back to BM25 results when query embedding fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { mode, results } = await hybridSearchPosts(
      'software engineering job search timeline'
    )

    expect(mode).toBe('lexical')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].url).toMatch(/^\/[a-z0-9-]+$/)
    expect(results[0].excerpts.length).toBeGreaterThan(0)
  })

  it('can run BM25-only without attempting query embedding', async () => {
    const mockedEmbedQuery = vi.mocked(embedQuery)
    mockedEmbedQuery.mockClear()

    const { mode, results } = await hybridSearchPosts(
      'software engineering job search timeline',
      { useVector: false }
    )

    expect(mode).toBe('lexical')
    expect(results.length).toBeGreaterThan(0)
    expect(mockedEmbedQuery).not.toHaveBeenCalled()
  })

  it('ranks the requested behind-the-scenes post first with prose excerpts', async () => {
    const { results } = await hybridSearchPosts('behind the scenes', {
      useVector: false,
    })

    expect(results[0]).toMatchObject({
      type: 'post',
      slug: 'bts-find-api',
      title: 'Behind the scenes of the Find AI API',
      description: '',
    })
    expect(results[0].excerpts.length).toBeGreaterThan(0)
    expect(
      results[0].excerpts.map((excerpt) => excerpt.text).join(' ')
    ).toContain('Find AI API')
    expect(
      results[0].excerpts.map((excerpt) => excerpt.text).join(' ')
    ).not.toContain('Americano at Sightglass Coffee in San Francisco')
  })

  it('retains image descriptions in explicit image search results', async () => {
    const { results } = await hybridSearchPosts('Americano Sightglass', {
      scope: 'images',
      useVector: false,
    })
    const result = results.find((result) => result.slug === 'bts-find-api')

    expect(result).toMatchObject({
      type: 'image',
      description: '',
      image: {
        description: 'Americano at Sightglass Coffee in San Francisco',
      },
      excerpts: [{ text: 'Americano at Sightglass Coffee in San Francisco' }],
    })
  })

  it('returns content pages in the default search scope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { mode, results } = await hybridSearchPosts('contact email')
    const contact = results.find((result) => result.url === '/contact')

    expect(mode).toBe('lexical')
    expect(contact).toMatchObject({
      type: 'page',
      title: 'Contact',
      newsletter: 'page',
      coverImage: '',
    })
    expect(
      contact?.excerpts.map((excerpt) => excerpt.text).join(' ')
    ).toContain('mail@philipithomas.com')
  })

  it('falls back to BM25 results when query embedding times out', async () => {
    const mockedEmbedQuery = vi.mocked(embedQuery)
    mockedEmbedQuery.mockClear()
    mockedEmbedQuery.mockImplementationOnce(() => new Promise(() => {}))

    const { mode, results } = await hybridSearchPosts(
      'software engineering job search timeline',
      { embeddingTimeoutMs: 1 }
    )

    expect(mode).toBe('lexical')
    expect(results.length).toBeGreaterThan(0)
    expect(mockedEmbedQuery).toHaveBeenCalledOnce()
  })
})
