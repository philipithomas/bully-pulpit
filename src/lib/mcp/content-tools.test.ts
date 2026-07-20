import { describe, expect, it } from 'vitest'
import { getAllPostsWithoutImages } from '@/lib/content/loader-without-images'
import {
  fetchInputSchema,
  fetchOutputSchema,
  fetchPublicContent,
  listPostsInputSchema,
  listPostsOutputSchema,
  listPublicPosts,
  MCP_LIST_MAX_POSTS,
  MCP_SEARCH_MAX_CHARACTERS,
  McpContentNotFoundError,
  searchInputSchema,
  searchOutputSchema,
  searchPublicContent,
} from '@/lib/mcp/content-tools'
import { buildCorpus } from '@/lib/search/corpus'

describe('MCP content schemas', () => {
  it('trims search input and rejects short, oversized, or unknown fields', () => {
    expect(searchInputSchema.parse({ query: '  coffee  ' })).toEqual({
      query: 'coffee',
    })
    expect(searchInputSchema.safeParse({ query: 'x' }).success).toBe(false)
    expect(
      searchInputSchema.safeParse({
        query: 'x'.repeat(MCP_SEARCH_MAX_CHARACTERS + 1),
      }).success
    ).toBe(false)
    expect(
      searchInputSchema.safeParse({ query: 'coffee', extra: true }).success
    ).toBe(false)
  })

  it('accepts only stable content IDs for fetch', () => {
    expect(fetchInputSchema.parse({ id: 'mcp-and-the-future-of-ai' })).toEqual({
      id: 'mcp-and-the-future-of-ai',
    })
    expect(fetchInputSchema.safeParse({ id: '../account' }).success).toBe(false)
    expect(
      fetchInputSchema.safeParse({ id: 'HTTPS://example.com' }).success
    ).toBe(false)
    expect(
      fetchInputSchema.safeParse({ id: 'colophon', extra: true }).success
    ).toBe(false)
  })

  it('defaults list pagination and rejects invalid or unknown inputs', () => {
    expect(listPostsInputSchema.parse({})).toEqual({ limit: 5, offset: 0 })
    expect(listPostsInputSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(
      listPostsInputSchema.safeParse({ limit: MCP_LIST_MAX_POSTS + 1 }).success
    ).toBe(false)
    expect(listPostsInputSchema.safeParse({ offset: -1 }).success).toBe(false)
    expect(
      listPostsInputSchema.safeParse({ newsletter: 'unknown' }).success
    ).toBe(false)
    expect(listPostsInputSchema.safeParse({ extra: true }).success).toBe(false)
  })
})

describe('MCP public content helpers', () => {
  it('searches the local corpus and returns bounded absolute URLs', async () => {
    const output = await searchPublicContent('MCP', { useVector: false })

    expect(output.results.length).toBeGreaterThan(0)
    expect(output.results.length).toBeLessThanOrEqual(10)
    expect(output.results).toContainEqual(
      expect.objectContaining({
        id: 'mcp-and-the-future-of-ai',
        title: 'MCP and the future of AI',
        url: 'https://www.philipithomas.com/mcp-and-the-future-of-ai',
      })
    )
    expect(() => searchOutputSchema.parse(output)).not.toThrow()
  })

  it('fetches posts, content pages, and registered app pages', () => {
    const post = fetchPublicContent('mcp-and-the-future-of-ai')
    const page = fetchPublicContent('colophon')
    const appPage = fetchPublicContent('app-home')

    expect(post).toMatchObject({
      id: 'mcp-and-the-future-of-ai',
      title: 'MCP and the future of AI',
      url: 'https://www.philipithomas.com/mcp-and-the-future-of-ai',
      metadata: {
        content_type: 'post',
        newsletter: 'contraption',
        published_at: '2025-10-13',
      },
    })
    expect(post.text).toContain('MCP')
    expect(page).toMatchObject({
      id: 'colophon',
      url: 'https://www.philipithomas.com/colophon',
      metadata: { content_type: 'page' },
    })
    expect(appPage).toMatchObject({
      id: 'app-home',
      title: 'Home',
      url: 'https://www.philipithomas.com/',
      metadata: { content_type: 'page' },
    })
    expect(() => fetchOutputSchema.parse(post)).not.toThrow()
  })

  it('throws a typed error for an unknown content ID', () => {
    expect(() => fetchPublicContent('definitely-not-a-page')).toThrow(
      McpContentNotFoundError
    )
  })

  it('keeps every searchable content ID valid and fetchable', () => {
    for (const { slug: id } of buildCorpus()) {
      expect(fetchInputSchema.safeParse({ id }).success, id).toBe(true)
      expect(() => fetchPublicContent(id), id).not.toThrow()
    }
  })

  it('lists posts in canonical newest-first order with pagination', () => {
    const expected = getAllPostsWithoutImages()
    const output = listPublicPosts({ limit: 3, offset: 1 })

    expect(output.posts.map((post) => post.id)).toEqual(
      expected.slice(1, 4).map((post) => post.slug)
    )
    expect(output.posts.every((post) => post.url.startsWith('https://'))).toBe(
      true
    )
    expect(output.pagination).toEqual({
      offset: 1,
      limit: 3,
      total: expected.length,
      hasMore: expected.length > 4,
      nextOffset: expected.length > 4 ? 4 : null,
    })
    expect(() => listPostsOutputSchema.parse(output)).not.toThrow()
  })

  it('filters posts by newsletter before paginating', () => {
    const workshopPosts = getAllPostsWithoutImages().filter(
      (post) => post.newsletter === 'workshop'
    )
    const output = listPublicPosts({
      limit: 2,
      offset: 1,
      newsletter: 'workshop',
    })

    expect(output.posts.map((post) => post.id)).toEqual(
      workshopPosts.slice(1, 3).map((post) => post.slug)
    )
    expect(output.posts.every((post) => post.newsletter === 'workshop')).toBe(
      true
    )
    expect(output.pagination.total).toBe(workshopPosts.length)
  })
})
