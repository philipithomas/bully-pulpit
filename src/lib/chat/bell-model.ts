import { type GatewayProviderOptions, gateway } from '@ai-sdk/gateway'

/** Shared speed-first model settings for Bell and short phone generations. */
export const BELL_MODEL_ID = 'openai/gpt-5.6-luna'
export const BELL_FALLBACK_MODEL_IDS = ['openai/gpt-5.4-mini'] as const
export const bellModel = gateway(BELL_MODEL_ID)

/** Disable reasoning latency for short, latency-sensitive responses. */
export const bellReasoning = 'none' as const

function bellEnvironment(): 'production' | 'preview' | 'development' {
  const value = process.env.VERCEL_ENV ?? process.env.NODE_ENV
  if (value === 'production' || value === 'preview') return value
  return 'development'
}

function getSharedProviderOptions(input: {
  feature: 'bell' | 'phone-greeting'
  surface: 'web' | 'sms' | 'phone'
  pseudonymousUser?: string | null
}) {
  return {
    openai: {
      // These surfaces do not render reasoning parts, so skip summaries.
      reasoningSummary: null,
    },
    gateway: {
      // Pin OpenAI direct and keep the fastest existing fallback for temporary
      // GPT-5.6 availability issues.
      order: ['openai'],
      sort: 'ttft',
      models: [...BELL_FALLBACK_MODEL_IDS],
      zeroDataRetention: true,
      ...(input.pseudonymousUser ? { user: input.pseudonymousUser } : {}),
      tags: [
        `feature:${input.feature}`,
        `surface:${input.surface}`,
        `env:${bellEnvironment()}`,
      ],
    } satisfies GatewayProviderOptions,
  }
}

export function getBellProviderOptions(input: {
  surface: 'web' | 'sms'
  pseudonymousUser?: string | null
}) {
  return getSharedProviderOptions({ feature: 'bell', ...input })
}

export function getPhoneGreetingProviderOptions() {
  return getSharedProviderOptions({
    feature: 'phone-greeting',
    surface: 'phone',
  })
}
