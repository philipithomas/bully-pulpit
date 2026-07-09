import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/search/hybrid', () => ({
  hybridSearchPosts: vi.fn(async () => ({ mode: 'lexical', results: [] })),
}))

import { GET } from '@/app/api/search/route'
import { hybridSearchPosts } from '@/lib/search/hybrid'

const mockedHybridSearchPosts = vi.mocked(hybridSearchPosts)

function searchRequest(query: string) {
  return new NextRequest(`https://example.com/api/search?${query}`)
}

describe('GET /api/search', () => {
  beforeEach(() => {
    mockedHybridSearchPosts.mockClear()
    mockedHybridSearchPosts.mockResolvedValue({ mode: 'lexical', results: [] })
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
})
