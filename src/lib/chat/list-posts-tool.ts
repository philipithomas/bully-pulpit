import { tool } from 'ai'
import { z } from 'zod/v4'
import { getAllPostsWithoutImages } from '@/lib/content/loader-without-images'
import { type Newsletter, newsletterSchema } from '@/lib/content/types'

export interface ListedPost {
  type: 'post'
  slug: string
  title: string
  url: string
  newsletter: Newsletter
  publishedAt: string
  description: string
}

export interface ListPostsResult {
  posts: ListedPost[]
  pagination: {
    offset: number
    limit: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
}

const listPostsFilterSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('all') }),
    z.object({
      mode: z.literal('only'),
      newsletter: newsletterSchema.describe('Newsletter to include'),
    }),
    z.object({
      mode: z.literal('exclude'),
      newsletter: newsletterSchema.describe('Newsletter to omit'),
    }),
  ])
  .default({ mode: 'all' })

export const listPostsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe('Number of posts to return, from 1 to 10'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Number of matching posts to skip for pagination'),
  filter: listPostsFilterSchema.describe(
    'Use mode all unless the visitor explicitly requests one newsletter or asks to exclude one'
  ),
})

export const listPosts = tool({
  description:
    "List Philip's published posts in deterministic newest-first order. Use this for latest, recent, newest, chronological, or archive-browsing questions. It returns posts only, never site pages or images. Keep filter.mode as all unless the visitor explicitly requests one newsletter or explicitly asks to exclude one. Use searchPosts instead when relevance to a topic matters.",
  inputSchema: listPostsInputSchema,
  execute: async ({ limit, offset, filter }) => {
    const resolvedFilter = filter ?? { mode: 'all' }
    const matchingPosts = getAllPostsWithoutImages().filter(
      (post) =>
        resolvedFilter.mode === 'all' ||
        (resolvedFilter.mode === 'only'
          ? post.newsletter === resolvedFilter.newsletter
          : post.newsletter !== resolvedFilter.newsletter)
    )
    const posts = matchingPosts.slice(offset, offset + limit).map((post) => ({
      type: 'post' as const,
      slug: post.slug,
      title: post.frontmatter.title,
      url: `/${post.slug}`,
      newsletter: post.newsletter,
      publishedAt: post.frontmatter.publishedAt,
      description: post.excerpt || post.frontmatter.title,
    }))
    const nextOffset = offset + posts.length

    return JSON.stringify({
      posts,
      pagination: {
        offset,
        limit,
        total: matchingPosts.length,
        hasMore: nextOffset < matchingPosts.length,
        nextOffset: nextOffset < matchingPosts.length ? nextOffset : null,
      },
    } satisfies ListPostsResult)
  },
})
