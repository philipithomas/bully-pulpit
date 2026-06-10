import crypto from 'node:crypto'
import type { CorpusPost } from '@/lib/search/corpus'

/**
 * Merkle tree over the search corpus. Chunk hashes commit to the exact text
 * (plus embedding model and dims) that was embedded; post hashes commit to a
 * post's chunk list; the root commits to the whole corpus. The committed
 * index in src/generated/search-index.json stores the same hashes, so
 * scripts/check-content.ts can verify the index offline and the index script
 * can reuse vectors for unchanged chunks.
 */

export interface MerkleChunk {
  seq: number
  hash: string
}

export interface MerklePost {
  slug: string
  hash: string
  chunks: MerkleChunk[]
}

export interface MerkleTree {
  root: string
  posts: MerklePost[]
}

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex')
}

export function chunkHash(model: string, dims: number, text: string): string {
  return sha256Hex(`${model}:${dims}:${text}`)
}

export function postHash(chunkHashes: string[]): string {
  return sha256Hex(chunkHashes.join(''))
}

export function merkleRoot(postHashes: string[]): string {
  return sha256Hex(postHashes.join(''))
}

/** Builds the merkle tree for a corpus, sorted by slug for a stable root. */
export function buildMerkleTree(
  corpus: CorpusPost[],
  model: string,
  dims: number
): MerkleTree {
  const posts: MerklePost[] = [...corpus]
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((post) => {
      const chunks = post.chunks.map((chunk) => ({
        seq: chunk.seq,
        hash: chunkHash(model, dims, chunk.text),
      }))
      return {
        slug: post.slug,
        hash: postHash(chunks.map((c) => c.hash)),
        chunks,
      }
    })

  return { root: merkleRoot(posts.map((p) => p.hash)), posts }
}

export interface MerkleDiff {
  /** Slugs present in both trees whose post hash differs (content changed) */
  changed: string[]
  /** Slugs in the recomputed tree but absent from the committed one */
  added: string[]
  /** Slugs in the committed tree but absent from the recomputed one */
  removed: string[]
  /** All slugs that make the committed tree stale (changed + added + removed) */
  stale: string[]
}

/**
 * Compares the recomputed tree against the committed one and returns exactly
 * which slugs are stale. An empty `stale` list implies equal roots.
 */
export function diffMerkleTrees(
  recomputed: MerkleTree,
  committed: MerkleTree
): MerkleDiff {
  const committedBySlug = new Map(committed.posts.map((p) => [p.slug, p.hash]))
  const recomputedSlugs = new Set(recomputed.posts.map((p) => p.slug))

  const changed: string[] = []
  const added: string[] = []
  for (const post of recomputed.posts) {
    const existing = committedBySlug.get(post.slug)
    if (existing === undefined) {
      added.push(post.slug)
    } else if (existing !== post.hash) {
      changed.push(post.slug)
    }
  }
  const removed = committed.posts
    .map((p) => p.slug)
    .filter((slug) => !recomputedSlugs.has(slug))

  const stale = [...changed, ...added, ...removed].sort()
  return { changed, added, removed, stale }
}
