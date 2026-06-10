import { gateway } from '@ai-sdk/gateway'
import { embedMany } from 'ai'

/**
 * Shared embedding pipeline for the committed search index and runtime query
 * embedding. Both sides go through truncateAndNormalize so the stored vectors
 * and query vectors can never drift apart.
 *
 * Model: OpenAI text-embedding-3-small via the Vercel AI Gateway. The raw
 * 1536-dim embeddings are truncated to the first 256 dims and L2-normalized
 * (Matryoshka truncation, documented by OpenAI as valid for this model).
 */

export const EMBEDDING_MODEL = 'openai/text-embedding-3-small'
export const EMBEDDING_DIMS = 256

/** Truncates to the first `dims` dimensions and L2-normalizes. */
export function truncateAndNormalize(
  embedding: number[],
  dims: number = EMBEDDING_DIMS
): number[] {
  const v = embedding.slice(0, dims)
  let sumSquares = 0
  for (const x of v) sumSquares += x * x
  const norm = Math.sqrt(sumSquares)
  if (norm === 0) return v
  return v.map((x) => x / norm)
}

/** Encodes a vector as base64 of little-endian float32 values. */
export function encodeVector(vector: number[]): string {
  const buf = Buffer.alloc(vector.length * 4)
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i], i * 4)
  }
  return buf.toString('base64')
}

/** Decodes a base64 little-endian float32 vector. */
export function decodeVector(encoded: string): Float32Array {
  const buf = Buffer.from(encoded, 'base64')
  const out = new Float32Array(Math.floor(buf.length / 4))
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readFloatLE(i * 4)
  }
  return out
}

/**
 * Embeds texts through the AI Gateway and returns truncated, normalized
 * vectors. Locally the gateway authenticates via VERCEL_OIDC_TOKEN (from
 * `vercel env pull`) or AI_GATEWAY_API_KEY.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: gateway.embeddingModel(EMBEDDING_MODEL),
    values: texts,
  })
  return embeddings.map((e) => truncateAndNormalize(e))
}

/** Embeds a single query string. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text])
  return vector
}
