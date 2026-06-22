import { getProviderData as getVercelProviderData } from '@flags-sdk/vercel'
import { mergeProviderData } from 'flags'
import {
  createFlagsDiscoveryEndpoint,
  getProviderData as getFlagsProviderData,
} from 'flags/next'
import { searchFeatureFlags } from '@/lib/search/flags'

export const GET = createFlagsDiscoveryEndpoint(() =>
  mergeProviderData([
    getFlagsProviderData(searchFeatureFlags),
    getVercelProviderData(searchFeatureFlags),
  ])
)
