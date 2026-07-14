import { type GatewayProviderOptions, gateway } from '@ai-sdk/gateway'

/** Shared GPT-5.6 Sol model for Bell's web and SMS surfaces. */
export const BELL_MODEL_ID = 'openai/gpt-5.6-sol'
export const bellModel = gateway(BELL_MODEL_ID)

/** A short greeting choice does not need Bell's flagship model. */
export const PHONE_GREETING_MODEL_ID = 'openai/gpt-5.6-luna'
export const phoneGreetingModel = gateway(PHONE_GREETING_MODEL_ID)

export type BellGenerationSurface = 'web' | 'sms'
type GenerationSurface = BellGenerationSurface | 'phone'

/** SMS is maximally deliberate; web starts fast and deepens on follow-ups. */
export function getBellReasoning(
  surface: BellGenerationSurface,
  turnNumber = 1
) {
  if (surface === 'sms') return 'xhigh' as const
  return turnNumber > 1 ? ('high' as const) : ('none' as const)
}

function bellEnvironment(): 'production' | 'preview' | 'development' {
  const value = process.env.VERCEL_ENV ?? process.env.NODE_ENV
  if (value === 'production' || value === 'preview') return value
  return 'development'
}

function getSharedProviderOptions(input: {
  feature: 'bell' | 'phone-greeting'
  surface: GenerationSurface
  pseudonymousUser?: string | null
}) {
  return {
    openai: {
      // These surfaces do not render reasoning parts, so skip summaries.
      reasoningSummary: null,
    },
    gateway: {
      // Keep the model on OpenAI and prefer the fastest available endpoint.
      order: ['openai'],
      sort: 'ttft',
      // Priority is best-effort: Gateway falls back to the standard service
      // tier when priority is unavailable, without changing the Sol model.
      ...(input.surface === 'web' ? { serviceTier: 'priority' as const } : {}),
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
