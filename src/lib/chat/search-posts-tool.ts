import { tool } from 'ai'
import { z } from 'zod/v4'
import {
  hybridSearchPosts,
  type SearchExcerpt,
  type SearchImageMatch,
  type SearchScope,
} from '@/lib/search/hybrid'

/**
 * Bell uses the same hybrid BM25/vector search as the typeahead route, then
 * keeps section metadata in excerpts so the model can cite exact headings.
 *
 * Excerpts carry the section they sit under when the chunk falls below a
 * heading: `section.url` is `/slug#anchor`, ready for the model to cite.
 */

export interface PostResult {
  type: 'post' | 'page' | 'image'
  title: string
  url: string
  newsletter: string
  coverImage: string
  excerpts: SearchExcerpt[]
  images: SearchImageMatch[]
  image?: SearchImageMatch
}

export const searchPosts = tool({
  description:
    'Search Philip\'s posts, site pages, and images by query. Use scope "posts" for writing, projects, informational pages, and site-level answers. Use scope "images" when the visitor asks what a photo shows or asks for photos/images. Returns titles, URLs, content excerpts, and image metadata. Excerpts and images may carry section URLs for citation.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    scope: z
      .enum(['posts', 'images'])
      .default('posts')
      .describe(
        'Search posts and pages by default, or only image assets for photo questions'
      ),
  }),
  execute: async ({ query, scope }) => {
    const resolvedScope: SearchScope = scope === 'images' ? 'images' : 'posts'
    const { results } = await hybridSearchPosts(query, {
      scope: resolvedScope,
      maxImages: resolvedScope === 'images' ? 1 : 3,
    })
    const toolResults: PostResult[] = results.map((result) => ({
      type: result.type,
      title: result.title,
      url: result.url,
      newsletter: result.newsletter,
      coverImage: result.coverImage,
      excerpts: result.excerpts,
      images: result.images,
      ...(result.image ? { image: result.image } : {}),
    }))
    return JSON.stringify(toolResults)
  },
})
