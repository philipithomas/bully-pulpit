import { afterEach, describe, expect, it, vi } from 'vitest'
import * as contentLoader from '@/lib/content/loader-without-images'
import {
  fetchInputSchema,
  fetchOutputSchema,
  fetchPublicContent,
  listPostsInputSchema,
  listPostsOutputSchema,
  listPublicPosts,
  MCP_LIST_MAX_POSTS,
  MCP_SEARCH_EXCERPT_MAX_CHARACTERS,
  MCP_SEARCH_MAX_CHARACTERS,
  MCP_SEARCH_MAX_EXCERPTS,
  MCP_SEARCH_MAX_RESULTS,
  McpContentNotFoundError,
  searchInputSchema,
  searchOutputSchema,
  searchPublicContent,
} from '@/lib/mcp/content-tools'
import { buildCorpus } from '@/lib/search/corpus'
import * as hybridSearch from '@/lib/search/hybrid'

afterEach(() => vi.restoreAllMocks())

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

  it.each([
    {
      query: 'noma',
      sources: [
        { id: 'stargazing', evidence: 'My personal top list Noma' },
        { id: '2024-05', evidence: 'Noma pop-up in NYC' },
      ],
    },
    {
      query: 'Stripe',
      sources: [
        { id: 'stripe-projects-launch', evidence: 'Stripe Projects' },
        { id: 'bts-find-api', evidence: 'usage-based billing' },
      ],
    },
  ])('exposes distinct source evidence for a $query synthesis', async ({
    query,
    sources,
  }) => {
    const output = await searchPublicContent(query, { useVector: false })

    for (const { id, evidence } of sources) {
      const result = output.results.find((candidate) => candidate.id === id)
      expect(result, id).toBeDefined()
      expect(
        result?.excerpts
          .map((excerpt) => excerpt.text)
          .join('\n')
          .replace(/\s+/g, ' ')
      ).toContain(evidence)
      expect(result?.type).toBe(id === 'stargazing' ? 'page' : 'post')
      expect(result?.newsletter).toBeTruthy()
    }
    expect(() => searchOutputSchema.parse(output)).not.toThrow()
  })

  it('retains dates and absolute section URLs with source excerpts', async () => {
    const output = await searchPublicContent('noma', { useVector: false })
    const post = output.results.find((result) => result.id === '2026-09')
    const page = output.results.find((result) => result.id === 'stargazing')

    expect(post?.publishedAt).toMatch(/^2026-09-\d{2}$/)
    expect(post?.excerpts).toContainEqual(
      expect.objectContaining({
        section: {
          heading: 'What I did in August',
          url: 'https://www.philipithomas.com/2026-09#what-i-did-in-august',
        },
      })
    )
    expect(page?.publishedAt).toBeNull()
  })

  it('bounds retrieval context and marks shortened excerpts', async () => {
    const result: hybridSearch.HybridSearchResult = {
      type: 'post',
      id: 'example',
      slug: 'example',
      title: 'Example',
      url: '/example',
      newsletter: 'workshop',
      publishedAt: '2026-09-01',
      coverImage: '',
      images: [],
      score: 1,
      excerpts: [
        { text: '  \n  ' },
        ...Array.from({ length: MCP_SEARCH_MAX_EXCERPTS + 1 }, () => ({
          text: 'x'.repeat(MCP_SEARCH_EXCERPT_MAX_CHARACTERS + 1),
          section: { heading: 'Details', url: '/example#details' },
        })),
      ],
    }
    vi.spyOn(hybridSearch, 'hybridSearchPosts').mockResolvedValueOnce({
      mode: 'hybrid',
      results: Array.from({ length: MCP_SEARCH_MAX_RESULTS + 1 }, () => result),
    })

    const output = await searchPublicContent('example')

    expect(output.results).toHaveLength(MCP_SEARCH_MAX_RESULTS)
    expect(output.results[0]?.excerpts).toHaveLength(MCP_SEARCH_MAX_EXCERPTS)
    expect(output.results[0]?.excerpts[0]).toEqual({
      text: `${'x'.repeat(MCP_SEARCH_EXCERPT_MAX_CHARACTERS - 1)}…`,
      section: {
        heading: 'Details',
        url: 'https://www.philipithomas.com/example#details',
      },
    })
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

  it('gives image-only photo posts their authored description and location', () => {
    const output = fetchPublicContent('cooking-class')

    expect(output.text).toContain(
      'Cover image description: Mette Søberg demonstrating how to use liquid nitrogen with parsley.'
    )
    expect(output.text).toContain('Location: Noma test kitchen')
    expect(output.text).toContain('Camera: Leica M11-P')
    expect(() => fetchOutputSchema.parse(output)).not.toThrow()
  })

  it('uses cover alt text to describe photo posts without an excerpt', () => {
    const posts = contentLoader
      .getAllPostsWithoutImages()
      .filter((post) => post.newsletter === 'tidbits')
    const offset = posts.findIndex((post) => post.slug === 'cooking-class')
    const photo = posts[offset]
    expect(photo?.excerpt).toBe('')
    const output = listPublicPosts({ limit: 1, offset, newsletter: 'tidbits' })

    expect(output.posts[0]).toMatchObject({
      id: 'cooking-class',
      description:
        'Mette Søberg demonstrating how to use liquid nitrogen with parsley.',
    })
    expect(() => listPostsOutputSchema.parse(output)).not.toThrow()
  })

  it.each([
    { alt: '  \n  ', expected: 'Photo title' },
    {
      alt: '  A meaningful description.  ',
      expected: 'A meaningful description.',
    },
  ])('trims photo-only listing descriptions before fallback: $alt', ({
    alt,
    expected,
  }) => {
    const post = contentLoader.getAllPostsWithoutImages()[0]
    vi.spyOn(contentLoader, 'getAllPostsWithoutImages').mockReturnValueOnce([
      {
        ...post,
        excerpt: '',
        frontmatter: {
          ...post.frontmatter,
          title: 'Photo title',
          coverImageAlt: alt,
        },
      },
    ])
    const output = listPublicPosts({ limit: 1, offset: 0 })
    expect(output.posts[0]?.description).toBe(expected)
  })

  it('keeps every searchable content ID valid and fetchable', () => {
    for (const { slug: id } of buildCorpus()) {
      expect(fetchInputSchema.safeParse({ id }).success, id).toBe(true)
      expect(() => fetchPublicContent(id), id).not.toThrow()
    }
  })

  it('lists posts in canonical newest-first order with pagination', () => {
    const expected = contentLoader.getAllPostsWithoutImages()
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
    const workshopPosts = contentLoader
      .getAllPostsWithoutImages()
      .filter((post) => post.newsletter === 'workshop')
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
