import { type GatewayProviderOptions, gateway } from '@ai-sdk/gateway'
import { stepCountIs } from 'ai'
import { fetchPage } from '@/lib/chat/fetch-page-tool'
import { fetchPost } from '@/lib/chat/fetch-post-tool'
import { searchPosts } from '@/lib/chat/search-posts-tool'

/** Shared Bell model and tool-loop settings for the web and SMS surfaces. */
export const bellModel = gateway('openai/gpt-5.6-luna')

/** Disable reasoning latency for Bell's short, tool-oriented responses. */
export const bellReasoning = 'none' as const

export const bellProviderOptions = {
  openai: {
    // Bell does not render reasoning parts, so skip summary generation.
    reasoningSummary: null,
  },
  gateway: {
    // Pin OpenAI direct and keep the fastest existing fallback for temporary
    // GPT-5.6 availability issues.
    order: ['openai'],
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
