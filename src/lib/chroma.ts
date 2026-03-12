import {
  ChromaCloudQwenEmbeddingFunction,
  ChromaCloudQwenEmbeddingModel,
} from '@chroma-core/chroma-cloud-qwen'
import { ChromaCloudSpladeEmbeddingFunction } from '@chroma-core/chroma-cloud-splade'
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
