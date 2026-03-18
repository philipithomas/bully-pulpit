import { tool } from 'ai'
import { K, Knn, Rrf, Search } from 'chromadb'
import { z } from 'zod/v4'
import { embedSparse, getClient, getPostsSchema } from '@/lib/chroma'

interface PostResult {
  title: string
  url: string
  newsletter: string
  excerpts: string[]
}

export const searchPosts = tool({
  description:
    'Search blog posts by query. Returns titles, URLs, and content excerpts.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    const client = getClient()
    const collection = await client.getOrCreateCollection({
      name: 'posts',
      schema: getPostsSchema(),
    })

    const sparseVector = await embedSparse(query)

    const search = new Search()
      .rank(
        Rrf({
          ranks: [
            Knn({
              query: sparseVector,
              key: 'sparse_embedding',
              limit: 20,
            }),
            Knn({
              query: query,
              limit: 20,
            }),
          ],
          weights: [2, 1],
          k: 60,
        })
      )
      .select(
        K.DOCUMENT,
        K.SCORE,
        K('slug'),
        K('title'),
        K('url'),
        K('newsletter'),
        K('type')
      )

    const result = await collection.search(search)
    const rows = result.rows()

    // Group by slug, collect excerpts
    const grouped = new Map<string, PostResult>()

    for (const group of rows) {
      for (const row of group) {
        const meta = row.metadata ?? {}
        const slug = meta.slug as string
        const docType = meta.type as string

        // Skip image-only chunks
        if (docType === 'image') continue

        if (!grouped.has(slug)) {
          grouped.set(slug, {
            title: meta.title as string,
            url: meta.url as string,
            newsletter: meta.newsletter as string,
            excerpts: [],
          })
        }

        const entry = grouped.get(slug)!
        if (entry.excerpts.length < 3 && row.document) {
          entry.excerpts.push(row.document)
        }
      }
    }

    const results = Array.from(grouped.values()).slice(0, 8)

    return JSON.stringify(results)
  },
})
