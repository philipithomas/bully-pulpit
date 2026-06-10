import { tool } from 'ai'
import { z } from 'zod/v4'
import type { CorpusPost } from '@/lib/search/corpus'
import { buildCorpus } from '@/lib/search/corpus'
import {
  decodeVector,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  embedQuery,
} from '@/lib/search/embedding'
import { loadSearchIndex } from '@/lib/search/index-file'
import { getLexicalIndex } from '@/lib/search/lexical'
import { chunkHash } from '@/lib/search/merkle'
import { rrfFuse, topKBySimilarity } from '@/lib/search/vector'

/**
 * Hybrid search for the Bell agent: BM25 (lexical index) fused with
 * brute-force cosine over the committed vector index via reciprocal rank
 * fusion. The committed index stores only hashes and vectors; chunk text is
 * recomputed from content/ at cold start and aligned to vectors by chunk
 * hash, so a stale vector can never be attributed to the wrong text. If the
 * query embedding fails, search degrades gracefully to BM25 only.
 */

interface PostResult {
  title: string
  url: string
  newsletter: string
  excerpts: string[]
}

interface VectorEntry {
  slug: string
  kind: string
  text: string
  vector: Float32Array
}

interface VectorStore {
  entries: VectorEntry[]
  meta: Map<string, Pick<CorpusPost, 'title' | 'url' | 'newsletter'>>
}

const VECTOR_LIMIT = 30
const MAX_POSTS = 10
const MAX_EXCERPTS = 3

let storePromise: Promise<VectorStore> | null = null

function getVectorStore(): Promise<VectorStore> {
  if (!storePromise) {
    storePromise = Promise.resolve().then(() => {
      const corpus = buildCorpus()
      const meta = new Map(
        corpus.map((post) => [
          post.slug,
          {
            title: post.title,
            url: post.url,
            newsletter: post.newsletter,
          },
        ])
      )

      const entries: VectorEntry[] = []
      const index = loadSearchIndex()
      if (!index || index.model !== EMBEDDING_MODEL) {
        return { entries, meta }
      }

      const indexBySlug = new Map(index.posts.map((p) => [p.slug, p]))
      for (const post of corpus) {
        const indexed = indexBySlug.get(post.slug)
        if (!indexed) continue
        const vectorByHash = new Map(
          indexed.chunks.map((c) => [c.hash, c.vector])
        )
        for (const chunk of post.chunks) {
          const hash = chunkHash(EMBEDDING_MODEL, EMBEDDING_DIMS, chunk.text)
          const vector = vectorByHash.get(hash)
          // Hash mismatch means the committed vector is stale for this text;
          // skip it rather than pair a vector with the wrong chunk
          if (!vector) continue
          entries.push({
            slug: post.slug,
            kind: chunk.kind,
            text: chunk.text,
            vector: decodeVector(vector),
          })
        }
      }

      return { entries, meta }
    })
  }
  return storePromise
}

export const searchPosts = tool({
  description:
    'Search blog posts by query. Returns titles, URLs, and content excerpts.',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    const [lexical, store] = await Promise.all([
      getLexicalIndex(),
      getVectorStore(),
    ])

    // BM25 ranking by post
    const lexicalHits = lexical.search(query, MAX_POSTS)
    const lexicalRanking = lexicalHits.map((hit) => hit.slug)
    const termsBySlug = new Map(lexicalHits.map((hit) => [hit.slug, hit.terms]))

    // Vector ranking: best chunks by cosine, grouped to a slug ranking.
    // Degrade to BM25 only if the embedding call fails.
    const chunksBySlug = new Map<string, VectorEntry[]>()
    const vectorRanking: string[] = []
    if (store.entries.length > 0) {
      try {
        const queryVector = await embedQuery(query)
        const top = topKBySimilarity(
          queryVector,
          store.entries,
          (entry) => entry.vector,
          VECTOR_LIMIT
        )
        for (const { item } of top) {
          if (!chunksBySlug.has(item.slug)) {
            chunksBySlug.set(item.slug, [])
            vectorRanking.push(item.slug)
          }
          chunksBySlug.get(item.slug)!.push(item)
        }
      } catch (err) {
        console.error('Query embedding failed, using BM25 only:', err)
      }
    }

    // Reciprocal rank fusion, equal weights
    const fused = rrfFuse([lexicalRanking, vectorRanking])

    const results: PostResult[] = []
    for (const { id: slug } of fused.slice(0, MAX_POSTS)) {
      const meta = store.meta.get(slug)
      if (!meta) continue

      // Best vector-matched body chunk texts serve as excerpts; fill from
      // the lexical side for posts that only matched by keyword
      const excerpts = (chunksBySlug.get(slug) ?? [])
        .filter((chunk) => chunk.kind === 'body')
        .map((chunk) => chunk.text)
        .slice(0, MAX_EXCERPTS)
      if (excerpts.length < MAX_EXCERPTS) {
        const terms = termsBySlug.get(slug)
        if (terms) {
          for (const excerpt of lexical.extractExcerpts(
            slug,
            terms,
            MAX_EXCERPTS - excerpts.length
          )) {
            const bare = excerpt.replace(/^…|…$/g, '')
            if (excerpts.some((e) => e.includes(bare))) continue
            excerpts.push(excerpt)
          }
        }
      }

      results.push({
        title: meta.title,
        url: meta.url,
        newsletter: meta.newsletter,
        excerpts,
      })
    }

    return JSON.stringify(results)
  },
})
