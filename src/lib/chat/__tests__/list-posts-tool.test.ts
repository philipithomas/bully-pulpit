import { describe, expect, it } from 'vitest'
import {
  type ListPostsResult,
  listPosts,
  listPostsInputSchema,
} from '@/lib/chat/list-posts-tool'
import { getAllPosts } from '@/lib/content/loader'
import { getAllPostsWithoutImages } from '@/lib/content/loader-without-images'

const callOptions = { toolCallId: 'test-call', messages: [], context: {} }

async function run(
  input: Parameters<NonNullable<typeof listPosts.execute>>[0]
): Promise<ListPostsResult> {
  const output = await listPosts.execute!(input, callOptions)
  return JSON.parse(output as string) as ListPostsResult
}

describe('listPosts tool output', () => {
  it('keeps the lightweight loader in canonical archive order', () => {
    expect(getAllPostsWithoutImages().map((post) => post.slug)).toEqual(
      getAllPosts().map((post) => post.slug)
    )
  })

  it('returns the latest post across every newsletter', async () => {
    const result = await run({
      limit: 1,
      offset: 0,
      filter: { mode: 'all' },
    })
    const expected = getAllPosts()[0]

    expect(result.posts).toEqual([
      {
        type: 'post',
        slug: expected.slug,
        title: expected.frontmatter.title,
        url: `/${expected.slug}`,
        newsletter: expected.newsletter,
        publishedAt: expected.frontmatter.publishedAt,
        description: expected.excerpt,
      },
    ])
    expect(result.posts[0]).not.toHaveProperty('coverImage')
    expect(result.posts[0]).not.toHaveProperty('images')
  })

  it('returns the latest Workshop post when explicitly filtered', async () => {
    const result = await run({
      limit: 1,
      offset: 0,
      filter: { mode: 'only', newsletter: 'workshop' },
    })
    const expected = getAllPosts().find(
      (post) => post.newsletter === 'workshop'
    )

    expect(result.posts.map((post) => post.slug)).toEqual([expected?.slug])
    expect(result.posts[0].newsletter).toBe('workshop')
  })

  it('includes archived newsletters in an unqualified listing', async () => {
    const tsundokuIndex = getAllPosts().findIndex(
      (post) => post.newsletter === 'tsundoku'
    )
    expect(tsundokuIndex).toBeGreaterThanOrEqual(0)

    const result = await run({
      limit: 1,
      offset: tsundokuIndex,
      filter: { mode: 'all' },
    })

    expect(result.posts[0].newsletter).toBe('tsundoku')
  })

  it('filters and excludes newsletters before pagination', async () => {
    const workshop = await run({
      limit: 4,
      offset: 1,
      filter: { mode: 'only', newsletter: 'workshop' },
    })
    const withoutTsundoku = await run({
      limit: 10,
      offset: 0,
      filter: { mode: 'exclude', newsletter: 'tsundoku' },
    })

    expect(workshop.posts.map((post) => post.slug)).toEqual(
      getAllPosts()
        .filter((post) => post.newsletter === 'workshop')
        .slice(1, 5)
        .map((post) => post.slug)
    )
    expect(
      withoutTsundoku.posts.every((post) => post.newsletter !== 'tsundoku')
    ).toBe(true)
    expect(withoutTsundoku.pagination.total).toBe(
      getAllPosts().filter((post) => post.newsletter !== 'tsundoku').length
    )
  })

  it('paginates without gaps and reports the next offset', async () => {
    const first = await run({
      limit: 3,
      offset: 0,
      filter: { mode: 'all' },
    })
    const second = await run({
      limit: 3,
      offset: 3,
      filter: { mode: 'all' },
    })

    expect(first.posts.map((post) => post.slug)).toEqual(
      getAllPosts()
        .slice(0, 3)
        .map((post) => post.slug)
    )
    expect(second.posts.map((post) => post.slug)).toEqual(
      getAllPosts()
        .slice(3, 6)
        .map((post) => post.slug)
    )
    expect(first.pagination).toMatchObject({
      offset: 0,
      limit: 3,
      total: getAllPosts().length,
      hasMore: true,
      nextOffset: 3,
    })
  })

  it('ends pagination cleanly beyond the archive', async () => {
    const result = await run({
      limit: 5,
      offset: getAllPosts().length + 10,
      filter: { mode: 'all' },
    })

    expect(result.posts).toEqual([])
    expect(result.pagination).toMatchObject({
      hasMore: false,
      nextOffset: null,
      total: getAllPosts().length,
    })
  })

  it('defaults to five posts from all newsletters', () => {
    expect(listPostsInputSchema.parse({})).toEqual({
      limit: 5,
      offset: 0,
      filter: { mode: 'all' },
    })
    expect(
      listPostsInputSchema.parse({
        filter: { mode: 'all', newsletter: 'workshop' },
      }).filter
    ).toEqual({ mode: 'all' })
  })

  it('rejects invalid pagination and newsletter inputs', () => {
    expect(listPostsInputSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(listPostsInputSchema.safeParse({ limit: 11 }).success).toBe(false)
    expect(listPostsInputSchema.safeParse({ offset: -1 }).success).toBe(false)
    expect(
      listPostsInputSchema.safeParse({ filter: { mode: 'sometimes' } }).success
    ).toBe(false)
    expect(
      listPostsInputSchema.safeParse({
        filter: { mode: 'only' },
      }).success
    ).toBe(false)
    expect(
      listPostsInputSchema.safeParse({
        filter: { mode: 'exclude', newsletter: 'not-a-newsletter' },
      }).success
    ).toBe(false)
  })
})
