import {
  ChromaCloudQwenEmbeddingFunction,
  ChromaCloudQwenEmbeddingModel,
} from '@chroma-core/chroma-cloud-qwen'
import { ChromaCloudSpladeEmbeddingFunction } from '@chroma-core/chroma-cloud-splade'
import type { SparseVector } from 'chromadb'
import {
  CloudClient,
  K,
  Schema,
  SparseVectorIndexConfig,
  VectorIndexConfig,
} from 'chromadb'

export function getClient() {
  const tenant = process.env.CHROMA_TENANT
  const database = process.env.CHROMA_DATABASE
  const apiKey = process.env.CHROMA_API_KEY

  if (!tenant || !database || !apiKey) {
    throw new Error('Missing CHROMA_TENANT, CHROMA_DATABASE, or CHROMA_API_KEY')
  }

  return new CloudClient({ tenant, database, apiKey })
}

export function getPostsSchema() {
  return new Schema()
    .createIndex(
      new VectorIndexConfig({
        embeddingFunction: new ChromaCloudQwenEmbeddingFunction({
          model: ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B,
          task: null,
        }),
        sourceKey: K.DOCUMENT,
      })
    )
    .createIndex(
      new SparseVectorIndexConfig({
        embeddingFunction: new ChromaCloudSpladeEmbeddingFunction(),
        sourceKey: K.DOCUMENT,
      }),
      'sparse_embedding'
    )
}

const EMBED_URL =
  'https://chroma-core--chroma-cloud-embed-publicchromacloudembedfl-dc8dbe.us-east.modal.direct/embed_sparse'

export async function embedSparse(text: string): Promise<SparseVector> {
  const apiKey = process.env.CHROMA_API_KEY
  if (!apiKey) {
    throw new Error('CHROMA_API_KEY not set')
  }
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: {
      'x-chroma-token': apiKey ?? '',
      'x-chroma-embedding-model': 'prithivida/Splade_PP_en_v1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts: [text], task: '', target: '' }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Embed failed: ${res.status} ${err}`)
  }

  const data = await res.json()
  const sv = data.embeddings[0] as SparseVector

  // Sort by indices ascending (match Python behavior)
  const pairs = sv.indices.map((idx: number, i: number) => ({
    index: idx,
    value: sv.values[i],
  }))
  pairs.sort((a: { index: number }, b: { index: number }) => a.index - b.index)
  sv.indices = pairs.map((p: { index: number }) => p.index)
  sv.values = pairs.map((p: { value: number }) => p.value)

  return sv
}

export function getPostSummariesSchema() {
  return new Schema().createIndex(
    new VectorIndexConfig({
      embeddingFunction: new ChromaCloudQwenEmbeddingFunction({
        model: ChromaCloudQwenEmbeddingModel.QWEN3_EMBEDDING_0p6B,
        task: null,
      }),
      sourceKey: K.DOCUMENT,
    })
  )
}
