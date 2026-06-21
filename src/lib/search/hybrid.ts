import type { ChunkHeading, CorpusPost, PostChunk } from '@/lib/search/corpus'
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
 * Unified post search used by both the typeahead UI and Bell. The BM25 side
 * comes from the lexical index, including its title boost; the vector side is
 * brute-force cosine over the committed local vector index. Results are fused
 * with weighted reciprocal rank fusion and degrade to BM25-only if runtime
 * query embedding is unavailable locally.
 */

export const HYBRID_SEARCH_WEIGHTS = {
  lexical: 0.7,
  vector: 0.3,
}

export interface HybridSearchWeights {
  lexical: number
  vector: number
}

export interface SearchExcerptSection {
  heading: string
  url: string
}

export interface SearchExcerpt {
  text: string
  /** Present when the excerpt sits under a heading; url is /slug#anchor */
  section?: SearchExcerptSection
}

export interface HybridSearchResult {
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  excerpts: SearchExcerpt[]
  score: number
}

export interface HybridSearchResponse {
  results: HybridSearchResult[]
  mode: 'hybrid' | 'lexical'
}

export interface HybridSearchOptions {
  limit?: number
  maxExcerpts?: number
  vectorLimit?: number
  weights?: HybridSearchWeights
}

interface VectorEntry {
  slug: string
  kind: string
  text: string
  heading?: ChunkHeading
  vector: Float32Array
}

interface PostMeta
  extends Pick<CorpusPost, 'title' | 'url' | 'newsletter' | 'coverImage'> {
  chunks: PostChunk[]
}

interface VectorStore {
  entries: VectorEntry[]
  meta: Map<string, PostMeta>
}

const DEFAULT_LIMIT = 10
const DEFAULT_MAX_EXCERPTS = 3
const DEFAULT_VECTOR_LIMIT = 30

let storePromise: Promise<VectorStore> | null = null
let hasLoggedEmbeddingFailure = false

function getVectorStore(): Promise<VectorStore> {
  if (!storePromise) {
    storePromise = Promise.resolve().then(() => {
      const corpus = buildCorpus()
      const meta = new Map<string, PostMeta>(
        corpus.map((post) => [
          post.slug,
          {
            title: post.title,
            url: post.url,
            newsletter: post.newsletter,
            coverImage: post.coverImage,
            chunks: post.chunks,
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
          // skip it rather than pair a vector with the wrong chunk.
          if (!vector) continue
          entries.push({
            slug: post.slug,
            kind: chunk.kind,
            text: chunk.text,
            ...(chunk.heading ? { heading: chunk.heading } : {}),
            vector: decodeVector(vector),
          })
        }
      }

      return { entries, meta }
    })
  }
  return storePromise
}

export async function hybridSearchPosts(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const maxExcerpts = options.maxExcerpts ?? DEFAULT_MAX_EXCERPTS
  const vectorLimit = options.vectorLimit ?? DEFAULT_VECTOR_LIMIT
  const weights = options.weights ?? HYBRID_SEARCH_WEIGHTS

  const [lexical, store] = await Promise.all([
    getLexicalIndex(),
    getVectorStore(),
  ])

  const lexicalHits = lexical.search(query, limit)
  const lexicalRanking = lexicalHits.map((hit) => hit.slug)
  const termsBySlug = new Map(lexicalHits.map((hit) => [hit.slug, hit.terms]))

  const chunksBySlug = new Map<string, VectorEntry[]>()
  const vectorRanking: string[] = []
  let mode: HybridSearchResponse['mode'] = 'lexical'

  if (store.entries.length > 0) {
    try {
      const queryVector = await embedQuery(query)
      const top = topKBySimilarity(
        queryVector,
        store.entries,
        (entry) => entry.vector,
        vectorLimit
      )
      for (const { item } of top) {
        if (!chunksBySlug.has(item.slug)) {
          chunksBySlug.set(item.slug, [])
          vectorRanking.push(item.slug)
        }
        chunksBySlug.get(item.slug)!.push(item)
      }
      mode = 'hybrid'
    } catch (err) {
      if (!hasLoggedEmbeddingFailure) {
        hasLoggedEmbeddingFailure = true
        const message =
          err instanceof Error ? err.message.split('\n')[0] : String(err)
        console.error(`Query embedding failed, using BM25 only: ${message}`)
      }
    }
  }

  const fused = rrfFuse([lexicalRanking, vectorRanking], 60, [
    weights.lexical,
    weights.vector,
  ])

  const results: HybridSearchResult[] = []
  for (const { id: slug, score } of fused.slice(0, limit)) {
    const meta = store.meta.get(slug)
    if (!meta) continue

    const toSection = (
      heading: ChunkHeading | undefined
    ): SearchExcerptSection | undefined =>
      heading
        ? { heading: heading.text, url: `${meta.url}#${heading.anchor}` }
        : undefined

    const excerpts: SearchExcerpt[] = (chunksBySlug.get(slug) ?? [])
      .filter((chunk) => chunk.kind === 'body')
      .slice(0, maxExcerpts)
      .map((chunk) => {
        const section = toSection(chunk.heading)
        return section ? { text: chunk.text, section } : { text: chunk.text }
      })

    if (excerpts.length < maxExcerpts) {
      const terms = termsBySlug.get(slug)
      if (terms) {
        for (const excerpt of lexical.extractExcerpts(
          slug,
          terms,
          maxExcerpts - excerpts.length
        )) {
          const bare = excerpt.replace(/^…|…$/g, '')
          if (excerpts.some((e) => e.text.includes(bare))) continue
          const source = meta.chunks.find(
            (chunk) => chunk.kind !== 'title' && chunk.text.includes(bare)
          )
          const section = toSection(source?.heading)
          excerpts.push(
            section ? { text: excerpt, section } : { text: excerpt }
          )
        }
      }
    }

    results.push({
      slug,
      title: meta.title,
      url: meta.url,
      newsletter: meta.newsletter,
      coverImage: meta.coverImage,
      excerpts,
      score,
    })
  }

  return { results, mode }
}
