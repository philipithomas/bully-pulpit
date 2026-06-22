import { z } from 'zod/v4'
import { siteConfig } from '@/lib/config'
import {
  getAllPosts,
  getPostBySlug,
  getPostsByNewsletter,
} from '@/lib/content/loader'
import type { Post } from '@/lib/content/types'
import { newsletterSchema } from '@/lib/content/types'
import { extractHeadings } from '@/lib/search/corpus'
import { getLexicalIndex } from '@/lib/search/lexical'

export const DEFAULT_LIST_LIMIT = 10
export const MAX_LIST_LIMIT = 50
export const DEFAULT_SEARCH_LIMIT = 10
export const MAX_SEARCH_LIMIT = 20

const cursorSchema = z.object({
  v: z.literal(1),
  offset: z.number().int().min(0),
  scope: z.string(),
})

const listPublicPostsInputSchema = z.object({
  newsletter: newsletterSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  cursor: z.string().optional(),
})

const searchPublicPostsInputSchema = z.object({
  query: z.string().trim().min(2),
  limit: z.coerce.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
  cursor: z.string().optional(),
})

const readPublicPostInputSchema = z.object({
  slug: z.string().trim().min(1),
})

export class PublicApiInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicApiInputError'
  }
}

export class PublicApiNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicApiNotFoundError'
  }
}

export interface PublicPagination {
  limit: number
  total: number
  nextCursor: string | null
}

export interface PublicPostSummary {
  slug: string
  url: string
  newsletter: string
  title: string
  subtitle: string | null
  description: string | null
  publishedAt: string
  coverImage: string | null
  coverImageAlt: string | null
  excerpt: string
}

export interface PublicSearchResult {
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string | null
  score: number
  publishedAt: string | null
  description: string | null
  excerpts: string[]
}

export interface PublicPostDetail extends PublicPostSummary {
  outline: Array<{ heading: string; anchor: string; url: string }>
  content: string
}

export function toAbsoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString()
}

export function publicPostSummary(post: Post): PublicPostSummary {
  return {
    slug: post.slug,
    url: toAbsoluteUrl(`/${post.slug}`),
    newsletter: post.newsletter,
    title: post.frontmatter.title,
    subtitle: post.frontmatter.subtitle ?? null,
    description: post.frontmatter.description ?? null,
    publishedAt: post.frontmatter.publishedAt,
    coverImage: post.frontmatter.coverImage
      ? toAbsoluteUrl(post.frontmatter.coverImage)
      : null,
    coverImageAlt: post.frontmatter.coverImageAlt ?? null,
    excerpt: post.excerpt,
  }
}

export function encodeCursor(offset: number, scope: string): string {
  return Buffer.from(JSON.stringify({ v: 1, offset, scope }))
    .toString('base64url')
    .replace(/=+$/, '')
}

export function decodeCursor(
  cursor: string | undefined,
  scope: string
): number {
  if (!cursor) return 0

  try {
    const decoded = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    )
    if (decoded.scope !== scope) {
      throw new PublicApiInputError(
        'Cursor does not match these request arguments'
      )
    }
    return decoded.offset
  } catch (error) {
    if (error instanceof PublicApiInputError) throw error
    throw new PublicApiInputError('Cursor is invalid')
  }
}

export function paged<T>(
  items: T[],
  limit: number,
  cursor: string | undefined,
  scope: string
): { page: T[]; pagination: PublicPagination } {
  const offset = decodeCursor(cursor, scope)
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return {
    page,
    pagination: {
      limit,
      total: items.length,
      nextCursor:
        nextOffset < items.length ? encodeCursor(nextOffset, scope) : null,
    },
  }
}

function parseInput<T>(schema: z.ZodType<T>, args: unknown): T {
  try {
    return schema.parse(args ?? {})
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PublicApiInputError(z.prettifyError(error))
    }
    throw error
  }
}

export function listPublicPosts(args: unknown = {}): {
  posts: PublicPostSummary[]
  pagination: PublicPagination
} {
  const input = parseInput(listPublicPostsInputSchema, args)
  const limit = input.limit ?? DEFAULT_LIST_LIMIT
  const newsletter = input.newsletter

  const posts = newsletter ? getPostsByNewsletter(newsletter) : getAllPosts()
  const scope = `list:${newsletter ?? 'all'}`
  const { page, pagination } = paged(posts, limit, input.cursor, scope)

  return {
    posts: page.map(publicPostSummary),
    pagination,
  }
}

export async function searchPublicPosts(args: unknown = {}): Promise<{
  query: string
  results: PublicSearchResult[]
  pagination: PublicPagination
}> {
  const input = parseInput(searchPublicPostsInputSchema, args)
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT
  const query = input.query
  const scope = `search:${query.toLowerCase()}`

  const [index, posts] = await Promise.all([
    getLexicalIndex(),
    Promise.resolve(getAllPosts()),
  ])
  const postBySlug = new Map(posts.map((post) => [post.slug, post]))
  const hits = index.search(query, posts.length)
  const { page, pagination } = paged(hits, limit, input.cursor, scope)

  return {
    query,
    results: page.map((hit) => {
      const post = postBySlug.get(hit.slug)
      return {
        slug: hit.slug,
        title: hit.title,
        url: toAbsoluteUrl(hit.url),
        newsletter: hit.newsletter,
        coverImage: hit.coverImage ? toAbsoluteUrl(hit.coverImage) : null,
        score: hit.score,
        publishedAt: post?.frontmatter.publishedAt ?? null,
        description: post?.frontmatter.description ?? null,
        excerpts: index.extractExcerpts(hit.slug, hit.terms, 3),
      }
    }),
    pagination,
  }
}

export function readPublicPost(args: unknown = {}): PublicPostDetail {
  const input = parseInput(readPublicPostInputSchema, args)
  const post = getPostBySlug(input.slug)
  if (!post) {
    throw new PublicApiNotFoundError(`No post found for slug "${input.slug}"`)
  }

  const outline = extractHeadings(post.content).map((heading) => ({
    heading: heading.text,
    anchor: heading.anchor,
    url: toAbsoluteUrl(`/${post.slug}#${heading.anchor}`),
  }))

  return {
    ...publicPostSummary(post),
    outline,
    content: post.content,
  }
}
