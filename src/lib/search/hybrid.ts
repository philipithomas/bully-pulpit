import type {
  ChunkHeading,
  CorpusImageAsset,
  CorpusPost,
  PostChunk,
} from '@/lib/search/corpus'
import { buildCorpus } from '@/lib/search/corpus'
import {
  decodeVector,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  embedQuery,
} from '@/lib/search/embedding'
import { loadSearchIndex, SEARCH_INDEX_VERSION } from '@/lib/search/index-file'
import { getLexicalIndex } from '@/lib/search/lexical'
import { chunkHash } from '@/lib/search/merkle'
import { rrfFuse, topKBySimilarity } from '@/lib/search/vector'

/**
 * Unified search used by both the typeahead UI and Bell. The default content
 * scope rolls text chunks and image assets up to posts or pages; the image
 * scope returns individual image matches. Both scopes fuse BM25 with
 * brute-force cosine over the committed local vector index and degrade to BM25
 * if runtime query embedding is unavailable or too slow.
 */

export const HYBRID_SEARCH_WEIGHTS = {
  lexical: 0.7,
  vector: 0.3,
}

export const DEFAULT_QUERY_EMBEDDING_TIMEOUT_MS = 800

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

// "posts" is the legacy default scope name. It now searches posts and pages.
export type SearchScope = 'posts' | 'images'

export interface SearchImageMatch {
  id: string
  src: string
  alt: string
  kind: CorpusImageAsset['kind']
  url: string
  description: string
  section?: SearchExcerptSection
}

export interface HybridSearchResult {
  type: 'post' | 'page' | 'image'
  id: string
  slug: string
  title: string
  url: string
  newsletter: string
  coverImage: string
  excerpts: SearchExcerpt[]
  images: SearchImageMatch[]
  image?: SearchImageMatch
  score: number
}

export interface HybridSearchResponse {
  results: HybridSearchResult[]
  mode: 'hybrid' | 'lexical'
}

export interface HybridSearchOptions {
  limit?: number
  maxExcerpts?: number
  maxImages?: number
  vectorLimit?: number
  weights?: HybridSearchWeights
  embeddingTimeoutMs?: number
  scope?: SearchScope
  useVector?: boolean
}

interface TextVectorEntry {
  type: 'chunk'
  slug: string
  kind: string
  text: string
  heading?: ChunkHeading
  vector: Float32Array
}

interface ImageVectorEntry {
  type: 'image'
  id: string
  slug: string
  image: CorpusImageAsset
  vector: Float32Array
}

type VectorEntry = TextVectorEntry | ImageVectorEntry

interface PostMeta
  extends Pick<
    CorpusPost,
    'contentType' | 'title' | 'url' | 'newsletter' | 'coverImage'
  > {
  chunks: PostChunk[]
  images: CorpusImageAsset[]
}

interface VectorStore {
  entries: VectorEntry[]
  meta: Map<string, PostMeta>
  images: Map<string, ImageVectorEntry>
}

const DEFAULT_LIMIT = 10
const DEFAULT_MAX_EXCERPTS = 3
const DEFAULT_MAX_IMAGES = 3
const DEFAULT_VECTOR_LIMIT = 30

let storePromise: Promise<VectorStore> | null = null
let hasLoggedEmbeddingFailure = false

function imageKey(slug: string, id: string): string {
  return `${slug}#${id}`
}

function buildPostMeta(corpus: CorpusPost[]): Map<string, PostMeta> {
  return new Map<string, PostMeta>(
    corpus.map((post) => [
      post.slug,
      {
        title: post.title,
        url: post.url,
        contentType: post.contentType,
        newsletter: post.newsletter,
        coverImage: post.coverImage,
        chunks: post.chunks,
        images: post.images,
      },
    ])
  )
}

function getVectorStore(): Promise<VectorStore> {
  if (!storePromise) {
    storePromise = Promise.resolve().then(() => {
      const corpus = buildCorpus()
      const meta = buildPostMeta(corpus)
      const entries: VectorEntry[] = []
      const images = new Map<string, ImageVectorEntry>()

      const index = loadSearchIndex()
      if (
        !index ||
        index.version !== SEARCH_INDEX_VERSION ||
        index.model !== EMBEDDING_MODEL ||
        index.dims !== EMBEDDING_DIMS
      ) {
        return { entries, meta, images }
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
            type: 'chunk',
            slug: post.slug,
            kind: chunk.kind,
            text: chunk.text,
            ...(chunk.heading ? { heading: chunk.heading } : {}),
            vector: decodeVector(vector),
          })
        }

        const vectorByImageId = new Map(
          indexed.images.map((image) => [image.id, image.vector])
        )
        for (const image of post.images) {
          const vector = vectorByImageId.get(image.id)
          if (!vector) continue
          const entry: ImageVectorEntry = {
            type: 'image',
            id: imageKey(post.slug, image.id),
            slug: post.slug,
            image,
            vector: decodeVector(vector),
          }
          entries.push(entry)
          images.set(entry.id, entry)
        }
      }

      return { entries, meta, images }
    })
  }
  return storePromise
}

async function embedQueryWithTimeout(
  query: string,
  timeoutMs: number
): Promise<number[]> {
  if (timeoutMs <= 0) return embedQuery(query)

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error(`Query embedding timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    return await Promise.race([
      embedQuery(query, { abortSignal: controller.signal }),
      timeoutPromise,
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function toSection(
  meta: PostMeta,
  heading: ChunkHeading | undefined
): SearchExcerptSection | undefined {
  return heading
    ? { heading: heading.text, url: `${meta.url}#${heading.anchor}` }
    : undefined
}

function toImageMatch(
  store: VectorStore,
  slug: string,
  image: CorpusImageAsset
): SearchImageMatch | null {
  const meta = store.meta.get(slug)
  if (!meta) return null
  const section = toSection(meta, image.heading)
  return {
    id: imageKey(slug, image.id),
    src: image.src,
    alt: image.alt || meta.title,
    kind: image.kind,
    url: section?.url ?? meta.url,
    description: image.alt || meta.title,
    ...(section ? { section } : {}),
  }
}

function logEmbeddingFailureOnce(err: unknown) {
  if (hasLoggedEmbeddingFailure) return
  hasLoggedEmbeddingFailure = true
  const message =
    err instanceof Error ? err.message.split('\n')[0] : String(err)
  console.error(
    `Query embedding failed or timed out, using BM25 only: ${message}`
  )
}

export async function hybridSearchPosts(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const limit = options.limit ?? DEFAULT_LIMIT
  const maxExcerpts = options.maxExcerpts ?? DEFAULT_MAX_EXCERPTS
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES
  const vectorLimit = options.vectorLimit ?? DEFAULT_VECTOR_LIMIT
  const weights = options.weights ?? HYBRID_SEARCH_WEIGHTS
  const useVector = options.useVector ?? true
  const embeddingTimeoutMs =
    options.embeddingTimeoutMs ?? DEFAULT_QUERY_EMBEDDING_TIMEOUT_MS
  const scope = options.scope ?? 'posts'

  const [lexical, store] = await Promise.all([
    getLexicalIndex(),
    getVectorStore(),
  ])

  const imageLexicalHits = lexical.searchImages(query, vectorLimit)

  if (scope === 'images') {
    const lexicalRanking = imageLexicalHits.map((hit) => hit.id)
    const vectorRanking: string[] = []
    let mode: HybridSearchResponse['mode'] = 'lexical'

    if (useVector && store.images.size > 0) {
      try {
        const queryVector = await embedQueryWithTimeout(
          query,
          embeddingTimeoutMs
        )
        const top = topKBySimilarity(
          queryVector,
          [...store.images.values()],
          (entry) => entry.vector,
          vectorLimit
        )
        for (const { item } of top) vectorRanking.push(item.id)
        mode = 'hybrid'
      } catch (err) {
        logEmbeddingFailureOnce(err)
      }
    }

    const fused = rrfFuse([lexicalRanking, vectorRanking], 60, [
      weights.lexical,
      weights.vector,
    ])

    const results: HybridSearchResult[] = []
    for (const { id, score } of fused.slice(0, limit)) {
      const entry = store.images.get(id)
      const meta = entry ? store.meta.get(entry.slug) : undefined
      const image = entry ? toImageMatch(store, entry.slug, entry.image) : null
      if (!entry || !meta || !image) continue
      results.push({
        type: 'image',
        id,
        slug: entry.slug,
        title: meta.title,
        url: image.url,
        newsletter: meta.newsletter,
        coverImage: image.src,
        excerpts: image.description
          ? [
              image.section
                ? { text: image.description, section: image.section }
                : { text: image.description },
            ]
          : [],
        images: [image],
        image,
        score,
      })
    }

    return { results, mode }
  }

  const lexicalHits = lexical.search(query, limit)
  const lexicalRanking = lexicalHits.map((hit) => hit.slug)
  const termsBySlug = new Map(lexicalHits.map((hit) => [hit.slug, hit.terms]))

  const chunksBySlug = new Map<string, TextVectorEntry[]>()
  const imagesBySlug = new Map<string, ImageVectorEntry[]>()
  const vectorRanking: string[] = []
  let mode: HybridSearchResponse['mode'] = 'lexical'

  for (const hit of imageLexicalHits) {
    const entry = store.images.get(hit.id)
    if (!entry) continue
    if (!imagesBySlug.has(entry.slug)) imagesBySlug.set(entry.slug, [])
    imagesBySlug.get(entry.slug)!.push(entry)
  }

  if (useVector && store.entries.length > 0) {
    try {
      const queryVector = await embedQueryWithTimeout(query, embeddingTimeoutMs)
      const top = topKBySimilarity(
        queryVector,
        store.entries,
        (entry) => entry.vector,
        vectorLimit
      )
      for (const { item } of top) {
        if (!vectorRanking.includes(item.slug)) vectorRanking.push(item.slug)
        if (item.type === 'chunk') {
          if (!chunksBySlug.has(item.slug)) chunksBySlug.set(item.slug, [])
          chunksBySlug.get(item.slug)!.push(item)
        } else {
          if (!imagesBySlug.has(item.slug)) imagesBySlug.set(item.slug, [])
          const images = imagesBySlug.get(item.slug)!
          if (!images.some((entry) => entry.id === item.id)) images.push(item)
        }
      }
      mode = 'hybrid'
    } catch (err) {
      logEmbeddingFailureOnce(err)
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

    const excerpts: SearchExcerpt[] = (chunksBySlug.get(slug) ?? [])
      .filter((chunk) => chunk.kind === 'body')
      .slice(0, maxExcerpts)
      .map((chunk) => {
        const section = toSection(meta, chunk.heading)
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
          const section = toSection(meta, source?.heading)
          excerpts.push(
            section ? { text: excerpt, section } : { text: excerpt }
          )
        }
      }
    }

    const images = (imagesBySlug.get(slug) ?? [])
      .map((entry) => toImageMatch(store, slug, entry.image))
      .filter((image): image is SearchImageMatch => image !== null)
      .filter(
        (image, index, all) =>
          all.findIndex((candidate) => candidate.id === image.id) === index
      )
      .slice(0, maxImages)

    results.push({
      type: meta.contentType,
      id: slug,
      slug,
      title: meta.title,
      url: meta.url,
      newsletter: meta.newsletter,
      coverImage: meta.coverImage,
      excerpts,
      images,
      score,
    })
  }

  return { results, mode }
}
