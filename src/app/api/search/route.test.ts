import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/search/hybrid', () => ({
  hybridSearchPosts: vi.fn(async () => ({ mode: 'lexical', results: [] })),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStatus: vi.fn(async () => 'allowed'),
}))

import { GET, MAX_SEARCH_QUERY_CHARACTERS } from '@/app/api/search/route'
import { checkRateLimitStatus } from '@/lib/rate-limit'
import { hybridSearchPosts } from '@/lib/search/hybrid'

const mockedHybridSearchPosts = vi.mocked(hybridSearchPosts)
const mockedCheckRateLimitStatus = vi.mocked(checkRateLimitStatus)

function searchRequest(query: string, headers?: HeadersInit) {
  return new NextRequest(`https://example.com/api/search?${query}`, { headers })
}

describe('GET /api/search', () => {
  beforeEach(() => {
    mockedHybridSearchPosts.mockClear()
    mockedHybridSearchPosts.mockResolvedValue({ mode: 'lexical', results: [] })
    mockedCheckRateLimitStatus.mockReset()
    mockedCheckRateLimitStatus.mockResolvedValue('allowed')
  })

  it('uses BM25 only for the typeahead first pass', async () => {
    const response = await GET(searchRequest('q=coffee&source=typeahead'))

    expect(response.status).toBe(200)
    expect(mockedHybridSearchPosts).toHaveBeenCalledWith('coffee', {
      scope: 'posts',
      useVector: false,
    })
  })

  it('uses full hybrid search for the typeahead enrichment pass', async () => {
    const response = await GET(
      searchRequest('q=coffee&source=typeahead&phase=hybrid')
    )

    expect(response.status).toBe(200)
    expect(mockedHybridSearchPosts).toHaveBeenCalledWith('coffee', {
      scope: 'posts',
      useVector: true,
    })
  })

  it('keeps non-typeahead search on the full hybrid path', async () => {
    const response = await GET(searchRequest('q=coffee&scope=images'))

    expect(response.status).toBe(200)
    expect(mockedHybridSearchPosts).toHaveBeenCalledWith('coffee', {
      scope: 'images',
      useVector: true,
    })
  })

  it('rejects oversized queries before rate limiting or search', async () => {
    const query = 'x'.repeat(MAX_SEARCH_QUERY_CHARACTERS + 1)
    const response = await GET(searchRequest(`q=${query}`))

    expect(response.status).toBe(400)
    expect(mockedCheckRateLimitStatus).not.toHaveBeenCalled()
    expect(mockedHybridSearchPosts).not.toHaveBeenCalled()
  })

  it('returns 429 when the search rule limits the caller', async () => {
    mockedCheckRateLimitStatus.mockResolvedValue('limited')

    const response = await GET(
      searchRequest('q=coffee', {
        'x-vercel-forwarded-for': '203.0.113.9, 10.0.0.1',
      })
    )

    expect(response.status).toBe(429)
    expect(mockedCheckRateLimitStatus).toHaveBeenCalledWith(
      'search',
      'ip:203.0.113.9',
      expect.any(NextRequest)
    )
    expect(mockedHybridSearchPosts).not.toHaveBeenCalled()
  })

  it('falls back to local BM25 when the limiter is unavailable', async () => {
    mockedCheckRateLimitStatus.mockResolvedValue('unavailable')

    const response = await GET(searchRequest('q=coffee&scope=images'))

    expect(response.status).toBe(200)
    expect(mockedHybridSearchPosts).toHaveBeenCalledWith('coffee', {
      scope: 'images',
      useVector: false,
    })
  })
})
