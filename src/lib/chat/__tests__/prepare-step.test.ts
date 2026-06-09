import { describe, expect, it } from 'vitest'
import { prepareChatStep } from '@/lib/chat/prepare-step'

const SYSTEM = 'You are Bell.'

const step = (...toolNames: string[]) => ({
  toolCalls: toolNames.map((toolName) => ({ toolName })),
})

describe('prepareChatStep', () => {
  it('returns no overrides before any search', () => {
    expect(prepareChatStep([], SYSTEM)).toBeUndefined()
    expect(prepareChatStep([step('fetchPost')], SYSTEM)).toBeUndefined()
  })

  it('raises reasoning effort once a search has run', () => {
    const result = prepareChatStep([step('searchPosts')], SYSTEM)
    expect(result).toEqual({
      providerOptions: { openai: { reasoningEffort: 'high' } },
    })
  })

  it('disables tools on the final step and tells the model so', () => {
    const steps = Array.from({ length: 5 }, () => step('searchPosts'))
    const result = prepareChatStep(steps, SYSTEM)
    expect(result?.activeTools).toEqual([])
    // The instruction is load-bearing: without it gpt-oss emits unbound
    // tool-call JSON into the visible reply.
    expect(result?.system).toContain(SYSTEM)
    expect(result?.system).toContain('tools are disabled')
    expect(result?.providerOptions).toEqual({
      openai: { reasoningEffort: 'high' },
    })
  })
})
