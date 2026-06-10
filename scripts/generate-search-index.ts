import fs from 'node:fs'
import path from 'node:path'
import { buildCorpus } from '@/lib/search/corpus'
import {
  decodeVector,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  embedTexts,
  encodeVector,
} from '@/lib/search/embedding'
import type { SearchIndexFile, SearchIndexPost } from '@/lib/search/index-file'
import { loadSearchIndex, SEARCH_INDEX_PATH } from '@/lib/search/index-file'
import { buildMerkleTree } from '@/lib/search/merkle'
import { topKBySimilarity } from '@/lib/search/vector'

/**
 * Generates the committed search artifacts:
 *
 *   1. src/generated/search-index.json — merkle hashes + embedding vectors
 *      for every chunk of every post. Vectors for unchanged chunk hashes are
 *      reused from the existing committed index, so a routine run after
 *      adding one post embeds only that post's chunks.
 *   2. src/generated/related-posts.json — top 3 related posts per post by
 *      cosine similarity between per-post centroid vectors. Score is
 *      (1 - cosine) so lower stays better, matching the previous format.
 *
 * Embedding goes through the Vercel AI Gateway (VERCEL_OIDC_TOKEN from
 * `vercel env pull`, or AI_GATEWAY_API_KEY). Run via `pnpm search:index`.
 */

const RELATED_PATH = path.join(
  process.cwd(),
  'src/generated/related-posts.json'
)
const EMBED_BATCH_SIZE = 100

interface RelatedPostsData {
  generatedAt: string
  posts: Record<string, { related: { slug: string; score: number }[] }>
}

async function main() {
  const corpus = buildCorpus()
  const tree = buildMerkleTree(corpus, EMBEDDING_MODEL, EMBEDDING_DIMS)
  const textBySlug = new Map(
    corpus.map((post) => [
      post.slug,
      new Map(post.chunks.map((chunk) => [chunk.seq, chunk.text])),
    ])
  )

  const totalChunks = tree.posts.reduce((n, p) => n + p.chunks.length, 0)
  console.log(
    `Corpus: ${corpus.length} posts, ${totalChunks} chunks (model ${EMBEDDING_MODEL}, ${EMBEDDING_DIMS} dims)`
  )

  // Reuse vectors from the committed index for unchanged chunk hashes
  const existing = loadSearchIndex()
  const reusable = new Map<string, string>()
  if (
    existing &&
    existing.model === EMBEDDING_MODEL &&
    existing.dims === EMBEDDING_DIMS
  ) {
    for (const post of existing.posts) {
      for (const chunk of post.chunks) {
        reusable.set(chunk.hash, chunk.vector)
      }
    }
  }

  // Collect chunks that need embedding (dedupe by hash)
  const toEmbed = new Map<string, string>() // hash -> text
  for (const post of tree.posts) {
    const texts = textBySlug.get(post.slug)!
    for (const chunk of post.chunks) {
      if (!reusable.has(chunk.hash) && !toEmbed.has(chunk.hash)) {
        toEmbed.set(chunk.hash, texts.get(chunk.seq)!)
      }
    }
  }

  const reusedCount = totalChunks - toEmbed.size
  if (toEmbed.size > 0) {
    const entries = [...toEmbed.entries()]
    for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
      const batch = entries.slice(i, i + EMBED_BATCH_SIZE)
      const vectors = await embedTexts(batch.map(([, text]) => text))
      for (let j = 0; j < batch.length; j++) {
        reusable.set(batch[j][0], encodeVector(vectors[j]))
      }
      console.log(
        `  Embedded ${Math.min(i + EMBED_BATCH_SIZE, entries.length)}/${entries.length} chunks`
      )
    }
  }

  // Assemble the index file, sorted by slug then seq for stable diffs
  // (buildMerkleTree already sorts posts by slug and chunks by seq)
  const posts: SearchIndexPost[] = tree.posts.map((post) => ({
    slug: post.slug,
    hash: post.hash,
    chunks: post.chunks.map((chunk) => ({
      seq: chunk.seq,
      hash: chunk.hash,
      vector: reusable.get(chunk.hash)!,
    })),
  }))

  const indexFile: SearchIndexFile = {
    version: 1,
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    merkleRoot: tree.root,
    posts,
  }

  fs.mkdirSync(path.dirname(SEARCH_INDEX_PATH), { recursive: true })
  fs.writeFileSync(SEARCH_INDEX_PATH, `${JSON.stringify(indexFile, null, 2)}\n`)
  console.log(
    `Wrote ${path.relative(process.cwd(), SEARCH_INDEX_PATH)} (${reusedCount} reused, ${toEmbed.size} embedded)`
  )

  // Related posts: per-post centroid = L2-normalized mean of chunk vectors
  const centroids = posts.map((post) => {
    const sum = new Array<number>(EMBEDDING_DIMS).fill(0)
    for (const chunk of post.chunks) {
      const v = decodeVector(chunk.vector)
      for (let i = 0; i < EMBEDDING_DIMS; i++) sum[i] += v[i]
    }
    const norm = Math.sqrt(sum.reduce((s, x) => s + x * x, 0)) || 1
    return { slug: post.slug, vector: sum.map((x) => x / norm) }
  })

  const related: RelatedPostsData = {
    generatedAt: new Date().toISOString(),
    posts: {},
  }
  // Keep the previous key order (date-descending, the corpus order)
  for (const post of corpus) {
    const self = centroids.find((c) => c.slug === post.slug)!
    const top = topKBySimilarity(
      self.vector,
      centroids.filter((c) => c.slug !== post.slug),
      (c) => c.vector,
      3
    )
    related.posts[post.slug] = {
      related: top.map(({ item, score }) => ({
        slug: item.slug,
        // (1 - cosine): lower = closer, same convention as before
        score: Number((1 - score).toFixed(7)),
      })),
    }
  }

  fs.writeFileSync(RELATED_PATH, `${JSON.stringify(related, null, 2)}\n`)
  console.log(`Wrote ${path.relative(process.cwd(), RELATED_PATH)}`)

  console.log(
    `Done: ${reusedCount} unchanged, ${toEmbed.size} embedded, root ${tree.root.slice(0, 16)}…`
  )
}

main().catch((err) => {
  console.error('Search index generation failed:', err)
  process.exit(1)
})
