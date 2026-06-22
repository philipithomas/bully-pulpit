import { vercelAdapter } from '@flags-sdk/vercel'
import { flag } from 'flags/next'
import type { SearchStrategy } from '@/lib/search/hybrid'
import { SEARCH_VISITOR_HEADER } from '@/lib/search/search-session'

export const SEARCH_STRATEGY_FLAG_KEY = 'search-strategy'

type SearchFlagEntities = {
  user?: {
    id: string
  }
}

export const searchStrategyFlag = flag<SearchStrategy, SearchFlagEntities>({
  key: SEARCH_STRATEGY_FLAG_KEY,
  description:
    'Chooses the typeahead search backend so BM25 and hybrid search can be compared.',
  defaultValue: 'bm25',
  options: [
    { label: 'BM25', value: 'bm25' },
    { label: 'Hybrid', value: 'hybrid' },
  ],
  adapter: vercelAdapter(),
  identify({ headers }) {
    const visitorId = headers.get(SEARCH_VISITOR_HEADER)?.trim()
    return visitorId ? { user: { id: visitorId } } : {}
  },
})

export const searchFeatureFlags = {
  searchStrategyFlag,
}
