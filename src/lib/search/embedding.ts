import { gateway } from '@ai-sdk/gateway'
import { embedMany } from 'ai'

/**
 * Shared embedding pipeline for the committed search index and runtime query
 * embedding. Both sides go through truncateAndNormalize so the stored vectors
 * and query vectors can never drift apart.
 *
 * Model: Google's Gemini Embedding 2 via the Vercel AI Gateway. Text queries
 * and text chunks use the AI SDK gateway provider. Image assets use the
 * gateway's OpenAI-compatible embeddings endpoint because the current AI SDK
 * embedding adapter is text-only, while Gemini Embedding 2 accepts OpenAI-style
 * text + image_url content parts through that endpoint.
 */

export const EMBEDDING_MODEL = 'google/gemini-embedding-2'
export const EMBEDDING_DIMS = 768
export const GATEWAY_EMBEDDINGS_URL =
  'https://ai-gateway.vercel.sh/v1/embeddings'
export const IMAGE_EMBED_MAX_EDGE = 768

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
interface EmbedTextsOptions {
  abortSignal?: AbortSignal
}

export async function embedTexts(
  texts: string[],
  options: EmbedTextsOptions = {}
): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: gateway.embeddingModel(EMBEDDING_MODEL),
    values: texts,
    abortSignal: options.abortSignal,
    providerOptions: {
      google: {
        outputDimensionality: EMBEDDING_DIMS,
      },
    },
    telemetry: {
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
      functionId: 'search-embedding',
    },
  })
  return embeddings.map((e) => truncateAndNormalize(e))
}

interface EmbedImageOptions extends EmbedTextsOptions {
  imagePath: string
  text: string
}

interface GatewayEmbeddingResponse {
  data?: { embedding?: number[] }[]
  error?: { message?: string } | string
}

async function imageDataUrlForEmbedding(imagePath: string): Promise<string> {
  const fs = await import('node:fs/promises')
  const sharp = (await import('sharp')).default
  const bytes = await sharp(await fs.readFile(imagePath))
    .rotate()
    .resize({
      width: IMAGE_EMBED_MAX_EDGE,
      height: IMAGE_EMBED_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer()

  return `data:image/jpeg;base64,${bytes.toString('base64')}`
}

/**
 * Embeds one image plus its deterministic text description into Gemini's shared
 * multimodal vector space. Requires AI_GATEWAY_API_KEY because the gateway's
 * OpenAI-compatible endpoint currently does not accept Vercel OIDC tokens.
 */
export async function embedImageWithDescription({
  imagePath,
  text,
  abortSignal,
}: EmbedImageOptions): Promise<number[]> {
  const apiKey = process.env.AI_GATEWAY_API_KEY
  if (!apiKey) {
    throw new Error(
      'AI_GATEWAY_API_KEY is required to embed multimodal image assets'
    )
  }

  const imageUrl = await imageDataUrlForEmbedding(imagePath)
  const response = await fetch(GATEWAY_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMS,
      input: [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    }),
    signal: abortSignal,
  })

  const body = (await response
    .json()
    .catch(() => null)) as GatewayEmbeddingResponse | null
  const embedding = body?.data?.[0]?.embedding
  if (!response.ok || !embedding) {
    const error =
      typeof body?.error === 'string'
        ? body.error
        : body?.error?.message || response.statusText
    throw new Error(`Gateway multimodal embedding failed: ${error}`)
  }

  return truncateAndNormalize(embedding)
}

/** Embeds a single query string. */
export async function embedQuery(
  text: string,
  options: EmbedTextsOptions = {}
): Promise<number[]> {
  const [vector] = await embedTexts([text], options)
  return vector
}
