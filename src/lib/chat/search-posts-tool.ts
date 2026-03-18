import { tool } from 'ai'
import { GroupBy, K, Knn, MinK, Rrf, Search } from 'chromadb'
import { z } from 'zod/v4'
import { getClient, getPostsSchema } from '@/lib/chroma'

interface PostResult {
  title: string
  url: string
  newsletter: string
  excerpts: string[]
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
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

    const search = new Search()
      .rank(
        Rrf({
          ranks: [
            Knn({
              query,
              returnRank: true,
              limit: 200,
            }),
            Knn({
              query,
              key: 'sparse_embedding',
              returnRank: true,
              limit: 200,
            }),
          ],
          weights: [1.0, 2.0],
          k: 60,
        })
      )
      .groupBy(new GroupBy([K('slug')], new MinK([K.SCORE], 3)))
      .limit(60)
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
            title: decodeEntities(meta.title as string),
            url: meta.url as string,
            newsletter: meta.newsletter as string,
            excerpts: [],
          })
        }

        const entry = grouped.get(slug)!
        if (entry.excerpts.length < 3 && row.document) {
          entry.excerpts.push(decodeEntities(row.document))
        }
      }
    }

    const results = Array.from(grouped.values()).slice(0, 20)

    return JSON.stringify(results)
  },
})
