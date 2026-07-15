import fs from 'node:fs'
import path from 'node:path'
import { newsletterSchema } from '@/lib/content/types'
import { buildCorpus, type CorpusImageAsset } from '@/lib/search/corpus'
import {
  decodeVector,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  embedImageWithDescription,
  embedTexts,
  encodeVector,
} from '@/lib/search/embedding'
import {
  publicImageDigest,
  publicImageFilePath,
} from '@/lib/search/image-source'
import type { SearchIndexFile, SearchIndexPost } from '@/lib/search/index-file'
import {
  loadSearchIndex,
  SEARCH_INDEX_PATH,
  SEARCH_INDEX_VERSION,
} from '@/lib/search/index-file'
import { buildMerkleTree } from '@/lib/search/merkle'
import { eligibleRelatedPostCandidates } from '@/lib/search/related-post-candidates'
import { topKBySimilarity } from '@/lib/search/vector'

/**
 * Generates the committed search artifacts:
 *
 *   1. src/generated/search-index.json — merkle hashes + embedding vectors
 *      for every text chunk and image asset of every searchable post and
 *      page. Vectors for unchanged hashes are reused from the existing
 *      committed index, so a routine run after adding one post embeds only
 *      that post's new text and image assets.
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
const EMBED_TEXT_BATCH_SIZE = 100

interface RelatedPostsData {
  generatedAt: string
  posts: Record<string, { related: { slug: string; score: number }[] }>
}

function imageAssetLabel(asset: CorpusImageAsset): string {
  return `${asset.kind === 'cover-image' ? 'cover' : asset.id} ${asset.src}`
}

async function main() {
  const corpus = buildCorpus({ imageDigest: publicImageDigest })
  const tree = buildMerkleTree(corpus, EMBEDDING_MODEL, EMBEDDING_DIMS)
  const textBySlug = new Map(
    corpus.map((post) => [
      post.slug,
      new Map(post.chunks.map((chunk) => [chunk.seq, chunk.text])),
    ])
  )
  const imageBySlug = new Map(
    corpus.map((post) => [
      post.slug,
      new Map(post.images.map((image) => [image.id, image])),
    ])
  )

  const totalChunks = tree.posts.reduce((n, p) => n + p.chunks.length, 0)
  const totalImages = tree.posts.reduce((n, p) => n + p.images.length, 0)
  console.log(
    `Corpus: ${corpus.length} entries, ${totalChunks} chunks, ${totalImages} images (model ${EMBEDDING_MODEL}, ${EMBEDDING_DIMS} dims)`
  )

  // Reuse vectors from the committed index for unchanged chunk hashes
  const existing = loadSearchIndex()
  const reusable = new Map<string, string>()
  if (
    existing &&
    existing.version === SEARCH_INDEX_VERSION &&
    existing.model === EMBEDDING_MODEL &&
    existing.dims === EMBEDDING_DIMS
  ) {
    for (const post of existing.posts) {
      for (const chunk of post.chunks) {
        reusable.set(chunk.hash, chunk.vector)
      }
      for (const image of post.images) {
        reusable.set(image.hash, image.vector)
      }
    }
  }

  // Collect text chunks that need embedding (dedupe by hash)
  const toEmbed = new Map<string, string>() // hash -> text
  const imagesToEmbed = new Map<
    string,
    { postSlug: string; hash: string; asset: CorpusImageAsset }
  >()
  for (const post of tree.posts) {
    const texts = textBySlug.get(post.slug)!
    for (const chunk of post.chunks) {
      if (!reusable.has(chunk.hash) && !toEmbed.has(chunk.hash)) {
        toEmbed.set(chunk.hash, texts.get(chunk.seq)!)
      }
    }
    const images = imageBySlug.get(post.slug)!
    for (const image of post.images) {
      if (!reusable.has(image.hash) && !imagesToEmbed.has(image.hash)) {
        const asset = images.get(image.id)!
        imagesToEmbed.set(image.hash, {
          postSlug: post.slug,
          hash: image.hash,
          asset,
        })
      }
    }
  }

  const reusedCount =
    totalChunks + totalImages - toEmbed.size - imagesToEmbed.size
  if (toEmbed.size > 0) {
    const entries = [...toEmbed.entries()]
    for (let i = 0; i < entries.length; i += EMBED_TEXT_BATCH_SIZE) {
      const batch = entries.slice(i, i + EMBED_TEXT_BATCH_SIZE)
      const vectors = await embedTexts(batch.map(([, text]) => text))
      for (let j = 0; j < batch.length; j++) {
        reusable.set(batch[j][0], encodeVector(vectors[j]))
      }
      console.log(
        `  Embedded ${Math.min(i + EMBED_TEXT_BATCH_SIZE, entries.length)}/${entries.length} chunks`
      )
    }
  }
  if (imagesToEmbed.size > 0) {
    const entries = [...imagesToEmbed.values()]
    for (let i = 0; i < entries.length; i++) {
      const { hash, postSlug, asset } = entries[i]
      const imagePath = publicImageFilePath(asset.src)
      if (!fs.existsSync(imagePath)) {
        throw new Error(
          `${postSlug}: image ${asset.src} does not exist on disk`
        )
      }
      const vector = await embedImageWithDescription({
        imagePath,
        text: asset.text,
      })
      reusable.set(hash, encodeVector(vector))
      console.log(
        `  Embedded image ${i + 1}/${entries.length}: ${postSlug} ${imageAssetLabel(asset)}`
      )
    }
  }

  // Assemble the index file, sorted by slug then seq for stable diffs
  // (buildMerkleTree already sorts posts by slug and preserves chunk/image order)
  const posts: SearchIndexPost[] = tree.posts.map((post) => ({
    slug: post.slug,
    hash: post.hash,
    chunks: post.chunks.map((chunk) => ({
      seq: chunk.seq,
      hash: chunk.hash,
      vector: reusable.get(chunk.hash)!,
    })),
    images: post.images.map((image) => ({
      id: image.id,
      hash: image.hash,
      vector: reusable.get(image.hash)!,
    })),
  }))

  const indexFile: SearchIndexFile = {
    version: SEARCH_INDEX_VERSION,
    model: EMBEDDING_MODEL,
    dims: EMBEDDING_DIMS,
    merkleRoot: tree.root,
    posts,
  }

  fs.mkdirSync(path.dirname(SEARCH_INDEX_PATH), { recursive: true })
  fs.writeFileSync(SEARCH_INDEX_PATH, `${JSON.stringify(indexFile, null, 2)}\n`)
  console.log(
    `Wrote ${path.relative(process.cwd(), SEARCH_INDEX_PATH)} (${reusedCount} reused, ${toEmbed.size} chunks embedded, ${imagesToEmbed.size} images embedded)`
  )

  // Related posts: per-post centroid = L2-normalized mean of text and image vectors
  // Content pages are searchable, but they do not belong in post recommendations.
  const centroids = posts.map((post) => {
    const sum = new Array<number>(EMBEDDING_DIMS).fill(0)
    const vectors = [
      ...post.chunks.map((chunk) => chunk.vector),
      ...post.images.map((image) => image.vector),
    ]
    for (const vector of vectors) {
      const v = decodeVector(vector)
      for (let i = 0; i < EMBEDDING_DIMS; i++) sum[i] += v[i]
    }
    const norm = Math.sqrt(sum.reduce((s, x) => s + x * x, 0)) || 1
    return { slug: post.slug, vector: sum.map((x) => x / norm) }
  })

  const related: RelatedPostsData = {
    generatedAt: new Date().toISOString(),
    posts: {},
  }
  const postCorpus = corpus.filter((entry) => entry.contentType === 'post')
  const postBySlug = new Map(postCorpus.map((post) => [post.slug, post]))
  const postCentroids = centroids
    .filter((centroid) => postBySlug.has(centroid.slug))
    .map((centroid) => ({
      ...centroid,
      newsletter: newsletterSchema.parse(
        postBySlug.get(centroid.slug)!.newsletter
      ),
    }))

  // Keep the previous key order (date-descending, the post corpus order)
  for (const post of postCorpus) {
    const self = postCentroids.find((centroid) => centroid.slug === post.slug)!
    const top = topKBySimilarity(
      self.vector,
      eligibleRelatedPostCandidates(self, postCentroids),
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
    `Done: ${reusedCount} unchanged, ${toEmbed.size} chunks embedded, ${imagesToEmbed.size} images embedded, root ${tree.root.slice(0, 16)}…`
  )
}

main().catch((err) => {
  console.error('Search index generation failed:', err)
  process.exit(1)
})
