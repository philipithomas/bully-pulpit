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
