import { z } from 'zod/v4'
import { toPagePlaintext } from '@/lib/chat/page-context'
import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'
import { getAllPostsWithoutImages } from '@/lib/content/loader-without-images'
import { newsletterSchema } from '@/lib/content/types'
import { publicAppPageBellText, publicAppPages } from '@/lib/public-pages'
import { hybridSearchPosts, type SearchScope } from '@/lib/search/hybrid'
import { siteIdentity } from '@/lib/site-identity'

export const MCP_SEARCH_MAX_CHARACTERS = 300
export const MCP_SEARCH_MAX_RESULTS = 10
export const MCP_SEARCH_MAX_EXCERPTS = 2
export const MCP_SEARCH_MAX_IMAGES = 3
export const MCP_SEARCH_EXCERPT_MAX_CHARACTERS = 600
export const MCP_FETCH_MAX_CHARACTERS = 50_000
export const MCP_LIST_MAX_POSTS = 10

export const searchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .max(MCP_SEARCH_MAX_CHARACTERS)
      .describe(
        "A natural-language query about Philip Ilic Thomas's public writing, photos, places, or website"
      ),
    scope: z
      .enum(['posts', 'images'])
      .optional()
      .describe(
        'Use images for photos and places photographed; defaults to posts'
      ),
  })
  .strict()

const locationSchema = z.object({ name: z.string(), url: z.url() }).strict()

const searchImageSchema = z
  .object({
    id: z.string(),
    src: z.url(),
    alt: z.string(),
    url: z.url(),
    kind: z.enum(['cover-image', 'body-image']),
    location: locationSchema.optional(),
    photoMetadata: z.string().optional(),
    section: z
      .object({ heading: z.string(), url: z.url() })
      .strict()
      .optional(),
  })
  .strict()

export const searchOutputSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            url: z.url(),
            type: z.enum(['post', 'page', 'image']),
            newsletter: z.string(),
            publishedAt: z.string().nullable(),
            description: z.string(),
            location: locationSchema.optional(),
            photoMetadata: z.string().optional(),
            images: z.array(searchImageSchema).max(MCP_SEARCH_MAX_IMAGES),
            excerpts: z
              .array(
                z
                  .object({
                    text: z
                      .string()
                      .min(1)
                      .max(MCP_SEARCH_EXCERPT_MAX_CHARACTERS),
                    section: z
                      .object({ heading: z.string(), url: z.url() })
                      .strict()
                      .optional(),
                  })
                  .strict()
              )
              .max(MCP_SEARCH_MAX_EXCERPTS),
          })
          .strict()
      )
      .max(MCP_SEARCH_MAX_RESULTS),
  })
  .strict()

export const fetchInputSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .describe('The stable result ID returned by search or list_posts'),
  })
  .strict()

export const fetchOutputSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
    url: z.url(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .strict()

export const listPostsInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(MCP_LIST_MAX_POSTS)
      .default(5)
      .describe('Number of posts to return, from 1 to 10'),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe('Number of matching posts to skip for pagination'),
    newsletter: newsletterSchema
      .optional()
      .describe('Optional newsletter slug; omit to include every newsletter'),
  })
  .strict()

export const listPostsOutputSchema = z
  .object({
    posts: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          url: z.url(),
          newsletter: newsletterSchema,
          publishedAt: z.string(),
          description: z.string(),
        })
        .strict()
    ),
    pagination: z
      .object({
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(MCP_LIST_MAX_POSTS),
        total: z.number().int().min(0),
        hasMore: z.boolean(),
        nextOffset: z.number().int().min(0).nullable(),
      })
      .strict(),
  })
  .strict()

export type SearchOutput = z.infer<typeof searchOutputSchema>
export type FetchOutput = z.infer<typeof fetchOutputSchema>
export type ListPostsInput = z.infer<typeof listPostsInputSchema>
export type ListPostsOutput = z.infer<typeof listPostsOutputSchema>

export class McpContentNotFoundError extends Error {
  constructor(id: string) {
    super(`No public post or page found for ID "${id}"`)
    this.name = 'McpContentNotFoundError'
  }
}

function absoluteUrl(path: string): string {
  return new URL(path, `${siteIdentity.productionUrl}/`).toString()
}

export async function searchPublicContent(
  query: string,
  options: { useVector?: boolean; scope?: SearchScope } = {}
): Promise<SearchOutput> {
  const search = await hybridSearchPosts(query, {
    scope: options.scope ?? 'posts',
    limit: MCP_SEARCH_MAX_RESULTS,
    maxExcerpts: MCP_SEARCH_MAX_EXCERPTS,
    maxImages: MCP_SEARCH_MAX_IMAGES,
    useVector: options.useVector,
  })

  return {
    results: search.results.slice(0, MCP_SEARCH_MAX_RESULTS).map((result) => ({
      // Even image hits keep the owning post ID so fetch accepts every result.
      id: result.slug,
      title: result.title,
      url: absoluteUrl(result.url),
      type: result.type,
      newsletter: result.newsletter,
      publishedAt: result.publishedAt ?? null,
      description: result.description,
      ...(result.location ? { location: result.location } : {}),
      ...(result.photoMetadata ? { photoMetadata: result.photoMetadata } : {}),
      images: result.images.slice(0, MCP_SEARCH_MAX_IMAGES).map((image) => ({
        id: image.id,
        src: absoluteUrl(image.src),
        alt: image.alt,
        url: absoluteUrl(image.url),
        kind: image.kind,
        ...(image.location ? { location: image.location } : {}),
        ...(image.photoMetadata ? { photoMetadata: image.photoMetadata } : {}),
        ...(image.section
          ? {
              section: {
                heading: image.section.heading,
                url: absoluteUrl(image.section.url),
              },
            }
          : {}),
      })),
      excerpts: result.excerpts
        .filter((excerpt) => excerpt.text.trim())
        .slice(0, MCP_SEARCH_MAX_EXCERPTS)
        .map((excerpt) => {
          const text = excerpt.text.trim()
          return {
            text:
              text.length > MCP_SEARCH_EXCERPT_MAX_CHARACTERS
                ? `${text.slice(0, MCP_SEARCH_EXCERPT_MAX_CHARACTERS - 1).trimEnd()}…`
                : text,
            ...(excerpt.section
              ? {
                  section: {
                    heading: excerpt.section.heading,
                    url: absoluteUrl(excerpt.section.url),
                  },
                }
              : {}),
          }
        }),
    })),
  }
}

export function fetchPublicContent(id: string): FetchOutput {
  const appPage = publicAppPages.find((page) => page.id === id)
  if (appPage) {
    const text = publicAppPageBellText(appPage)
    return {
      id,
      title: appPage.title,
      text: text.slice(0, MCP_FETCH_MAX_CHARACTERS),
      url: absoluteUrl(appPage.path),
      metadata: {
        content_type: 'page',
        ...(text.length > MCP_FETCH_MAX_CHARACTERS
          ? { truncated: 'true' }
          : {}),
      },
    }
  }

  const post = getPostBySlug(id)
  const page = post ? null : getPageBySlug(id)
  const item = post ?? page
  if (!item) throw new McpContentNotFoundError(id)

  const text = toPagePlaintext(item)
  return {
    id,
    title: item.frontmatter.title,
    text: text.slice(0, MCP_FETCH_MAX_CHARACTERS),
    url: absoluteUrl(`/${id}`),
    metadata: {
      content_type: post ? 'post' : 'page',
      ...(post ? { newsletter: post.newsletter } : {}),
      ...(item.frontmatter.publishedAt
        ? { published_at: item.frontmatter.publishedAt }
        : {}),
      ...(text.length > MCP_FETCH_MAX_CHARACTERS ? { truncated: 'true' } : {}),
    },
  }
}

export function listPublicPosts({
  limit,
  offset,
  newsletter,
}: ListPostsInput): ListPostsOutput {
  const matchingPosts = getAllPostsWithoutImages().filter(
    (post) => !newsletter || post.newsletter === newsletter
  )
  const posts = matchingPosts.slice(offset, offset + limit).map((post) => ({
    id: post.slug,
    title: post.frontmatter.title,
    url: absoluteUrl(`/${post.slug}`),
    newsletter: post.newsletter,
    publishedAt: post.frontmatter.publishedAt,
    description:
      post.excerpt ||
      post.frontmatter.coverImageAlt?.trim() ||
      post.frontmatter.title,
  }))
  const nextOffset = offset + posts.length

  return {
    posts,
    pagination: {
      offset,
      limit,
      total: matchingPosts.length,
      hasMore: nextOffset < matchingPosts.length,
      nextOffset: nextOffset < matchingPosts.length ? nextOffset : null,
    },
  }
}
