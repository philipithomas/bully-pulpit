import { describe, expect, it } from 'vitest'
import type { CorpusPost } from '@/lib/search/corpus'
import { buildCorpus } from '@/lib/search/corpus'
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from '@/lib/search/embedding'
import { loadSearchIndex } from '@/lib/search/index-file'
import {
  buildMerkleTree,
  chunkHash,
  diffMerkleTrees,
  sha256Hex,
} from '@/lib/search/merkle'

const MODEL = 'openai/text-embedding-3-small'
const DIMS = 256

function makeCorpusPost(slug: string, texts: string[]): CorpusPost {
  return {
    slug,
    title: slug,
    url: `/${slug}`,
    newsletter: 'workshop',
    description: '',
    coverImage: '',
    coverAlt: '',
    chunks: texts.map((text, seq) => ({
      seq,
      kind: seq === 0 ? ('title' as const) : ('body' as const),
      text,
    })),
  }
}

describe('chunkHash', () => {
  it('commits to model, dims, and text', () => {
    const base = chunkHash(MODEL, DIMS, 'hello')
    expect(base).toBe(sha256Hex(`${MODEL}:${DIMS}:hello`))
    expect(chunkHash(MODEL, 512, 'hello')).not.toBe(base)
    expect(chunkHash('other-model', DIMS, 'hello')).not.toBe(base)
    expect(chunkHash(MODEL, DIMS, 'hello!')).not.toBe(base)
  })
})

describe('buildMerkleTree', () => {
  it('produces the same root regardless of corpus order', () => {
    const a = makeCorpusPost('alpha', ['t', 'one'])
    const b = makeCorpusPost('beta', ['t', 'two'])
    const tree1 = buildMerkleTree([a, b], MODEL, DIMS)
    const tree2 = buildMerkleTree([b, a], MODEL, DIMS)
    expect(tree1.root).toBe(tree2.root)
    expect(tree1.posts.map((p) => p.slug)).toEqual(['alpha', 'beta'])
  })

  it('changes the root when any chunk text changes', () => {
    const tree1 = buildMerkleTree(
      [makeCorpusPost('a', ['t', 'x'])],
      MODEL,
      DIMS
    )
    const tree2 = buildMerkleTree(
      [makeCorpusPost('a', ['t', 'y'])],
      MODEL,
      DIMS
    )
    expect(tree1.root).not.toBe(tree2.root)
  })
})

describe('diffMerkleTrees', () => {
  const corpus = [
    makeCorpusPost('alpha', ['title a', 'body a']),
    makeCorpusPost('beta', ['title b', 'body b']),
    makeCorpusPost('gamma', ['title c', 'body c']),
  ]
  const committed = buildMerkleTree(corpus, MODEL, DIMS)

  it('returns no stale slugs for identical trees', () => {
    const recomputed = buildMerkleTree(corpus, MODEL, DIMS)
    const diff = diffMerkleTrees(recomputed, committed)
    expect(diff.stale).toEqual([])
    expect(recomputed.root).toBe(committed.root)
  })

  it('detects exactly the changed slug', () => {
    const edited = [
      corpus[0],
      makeCorpusPost('beta', ['title b', 'body b EDITED']),
      corpus[2],
    ]
    const diff = diffMerkleTrees(
      buildMerkleTree(edited, MODEL, DIMS),
      committed
    )
    expect(diff.changed).toEqual(['beta'])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.stale).toEqual(['beta'])
  })

  it('detects added and removed slugs', () => {
    const next = [
      corpus[0],
      corpus[2],
      makeCorpusPost('delta', ['title d', 'body d']),
    ]
    const diff = diffMerkleTrees(buildMerkleTree(next, MODEL, DIMS), committed)
    expect(diff.added).toEqual(['delta'])
    expect(diff.removed).toEqual(['beta'])
    expect(diff.stale).toEqual(['beta', 'delta'])
  })

  it('detects a chunk-level change through the post hash', () => {
    const edited = [
      makeCorpusPost('alpha', ['title a', 'body a', 'extra chunk']),
      corpus[1],
      corpus[2],
    ]
    const diff = diffMerkleTrees(
      buildMerkleTree(edited, MODEL, DIMS),
      committed
    )
    expect(diff.stale).toEqual(['alpha'])
  })
})

describe('committed index stability', () => {
  it('matches the recomputed merkle root: heading metadata is hash-transparent', () => {
    // Chunk hashes commit to model:dims:text only. Section anchors are chunk
    // metadata, so the committed index must still verify byte-for-byte.
    const index = loadSearchIndex()
    expect(index).not.toBeNull()
    expect(index!.model).toBe(EMBEDDING_MODEL)
    expect(index!.dims).toBe(EMBEDDING_DIMS)
    const tree = buildMerkleTree(buildCorpus(), EMBEDDING_MODEL, EMBEDDING_DIMS)
    expect(tree.root).toBe(index!.merkleRoot)
  })
})
