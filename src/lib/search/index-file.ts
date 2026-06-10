import fs from 'node:fs'
import path from 'node:path'

/**
 * Committed vector index at src/generated/search-index.json. Stores no chunk
 * text — only merkle hashes and base64-encoded float32 vectors. Chunk text is
 * recomputed from content/ at runtime and aligned to vectors by chunk hash.
 */

export interface SearchIndexChunk {
  seq: number
  hash: string
  /** base64 float32 little-endian, EMBEDDING_DIMS dims, L2-normalized */
  vector: string
}

export interface SearchIndexPost {
  slug: string
  hash: string
  chunks: SearchIndexChunk[]
}

export interface SearchIndexFile {
  version: 1
  model: string
  dims: number
  merkleRoot: string
  posts: SearchIndexPost[]
}

export const SEARCH_INDEX_PATH = path.join(
  process.cwd(),
  'src/generated/search-index.json'
)

export function loadSearchIndex(): SearchIndexFile | null {
  if (!fs.existsSync(SEARCH_INDEX_PATH)) return null
  return JSON.parse(
    fs.readFileSync(SEARCH_INDEX_PATH, 'utf-8')
  ) as SearchIndexFile
}
