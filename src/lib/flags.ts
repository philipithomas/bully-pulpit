import { vercelAdapter } from '@flags-sdk/vercel'
import { flag } from 'flags/next'

export const typeaheadEmbeddingSearch = flag<boolean>({
  key: 'typeahead-embedding-search',
  adapter: vercelAdapter(),
  defaultValue: false,
  options: [
    { value: false, label: 'BM25 only' },
    { value: true, label: 'Hybrid embeddings' },
  ],
  description:
    'Enable Gemini query embeddings for the public typeahead search.',
})

export const smsSignupUi = flag<boolean>({
  key: 'sms-signup-ui',
  adapter: vercelAdapter(),
  defaultValue: false,
  options: [
    { value: false, label: 'Hidden' },
    { value: true, label: 'Visible' },
  ],
  description:
    'Show public SMS signup prompts and the phone menu SMS signup option.',
})
