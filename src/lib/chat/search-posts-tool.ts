import { tool } from 'ai'
import { z } from 'zod/v4'
import { hybridSearchPosts, type SearchExcerpt } from '@/lib/search/hybrid'

/**
 * Bell uses the same hybrid BM25/vector search as the typeahead route, then
 * keeps section metadata in excerpts so the model can cite exact headings.
 *
 * Excerpts carry the section they sit under when the chunk falls below a
 * heading: `section.url` is `/slug#anchor`, ready for the model to cite.
 */

export interface PostResult {
  title: string
  url: string
  newsletter: string
  excerpts: SearchExcerpt[]
}

export const searchPosts = tool({
  description:
    'Search blog posts by query. Returns titles, URLs, and content excerpts. Excerpts may carry a section with a heading and a /slug#anchor url for citing the exact section.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    const { results } = await hybridSearchPosts(query)
    const toolResults: PostResult[] = results.map((result) => ({
      title: result.title,
      url: result.url,
      newsletter: result.newsletter,
      excerpts: result.excerpts,
    }))
    return JSON.stringify(toolResults)
  },
})
