import { type GatewayProviderOptions, gateway } from '@ai-sdk/gateway'
import { stepCountIs } from 'ai'
import { fetchPage } from '@/lib/chat/fetch-page-tool'
import { fetchPost } from '@/lib/chat/fetch-post-tool'
import { searchPosts } from '@/lib/chat/search-posts-tool'

/** Shared Bell model and tool-loop settings for the web and SMS surfaces. */
export const bellModel = gateway('anthropic/claude-haiku-4.5')

export const bellProviderOptions = {
  gateway: {
    // Anthropic direct has the best time to first token for Haiku 4.5. Keep
    // the remaining healthy providers fastest-first for failover.
    order: ['anthropic'],
    sort: 'ttft',
    models: ['openai/gpt-5.4-mini'],
  } satisfies GatewayProviderOptions,
}

export const bellTools = { searchPosts, fetchPost, fetchPage }

export const bellStopWhen = stepCountIs(7)

/** The final step cannot call tools, so every Bell run ends in prose. */
export function prepareBellStep({ stepNumber }: { stepNumber: number }) {
  return stepNumber >= 6 ? { activeTools: [] } : undefined
}
