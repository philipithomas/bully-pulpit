import type { MockLanguageModelV4 } from 'ai/test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBellProviderOptions } from '@/lib/chat/bell-model'
import type { BellLiveActionHandler } from '@/lib/phone/bell-live-actions'
import {
  BELL_LIVE_SUMMARY_MAX_CHARACTERS,
  type BellLiveDelegationInput,
  runBellLiveDelegation,
} from '@/lib/phone/bell-live-backend'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  read: vi.fn(),
  model: undefined as unknown as MockLanguageModelV4,
}))

vi.mock('@/lib/chat/bell-generation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/chat/bell-generation')>()
  const { MockLanguageModelV4 } = await import('ai/test')
  mocks.model = new MockLanguageModelV4({
    doGenerate: (options) => mocks.generate(options),
  })
  return {
    ...actual,
    bellModel: mocks.model,
    bellTools: {
      ...actual.bellTools,
      fetchPost: { ...actual.bellTools.fetchPost, execute: mocks.read },
    },
  }
})

function usage(textTokens = 15) {
  return {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: textTokens + 10, text: textTokens, reasoning: 10 },
  }
}

function textResult(text: string, tokens = 15) {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: usage(tokens),
    warnings: [],
  }
}

function toolResult(name: string, input = '{}') {
  return {
    content: [
      { type: 'tool-call', toolCallId: 'tool-1', toolName: name, input },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
    usage: usage(),
    warnings: [],
  }
}

function input(
  overrides: Partial<BellLiveDelegationInput> = {}
): BellLiveDelegationInput {
  return {
    transcript: 'Caller: "What has Philip written about coffee?"',
    callerTurn: 3,
    isCurrent: () => true,
    signal: new AbortController().signal,
    deadline: Date.now() + 255_000,
    ...overrides,
  }
}

function actionHandler() {
  return {
    execute: vi.fn<BellLiveActionHandler['execute']>().mockResolvedValue({
      status: 'unavailable',
      message: 'Action unavailable.',
    }),
    hasHandedOff: vi.fn().mockReturnValue(false),
    markSubscriptionDisclosureDelivered: vi.fn(),
    cancelSubscriptionDisclosure: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.model.doGenerateCalls.length = 0
  mocks.generate.mockReset().mockResolvedValue(textResult('A sourced answer.'))
  mocks.read.mockReset().mockResolvedValue({
    title: 'Coffee',
    content: 'Distinct source evidence.',
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GPT-Live Bell backend', () => {
  it('uses shared archive tools with high reasoning, ZDR, and no provider storage', async () => {
    await expect(runBellLiveDelegation(input())).resolves.toBe(
      'A sourced answer.'
    )
    const call = mocks.model.doGenerateCalls[0]
    expect(call.reasoning).toBe('high')
    expect(call.maxOutputTokens).toBe(32_768)
    expect(call.providerOptions).toMatchObject({
      openai: { store: false },
      gateway: {
        zeroDataRetention: true,
        tags: ['feature:bell', 'surface:phone', expect.stringMatching(/^env:/)],
      },
    })
    expect(
      getBellProviderOptions({ surface: 'phone' }).gateway
    ).not.toHaveProperty('only')
    expect(
      getBellProviderOptions({ surface: 'phone' }).gateway
    ).not.toHaveProperty('user')
    const names = call.tools?.map((tool) => tool.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'searchPosts',
        'listPosts',
        'fetchPost',
        'fetchPage',
        'fetchPublicUrl',
        'start_voicemail',
        'open_signup_menu',
      ])
    )
    expect(names).not.toContain('subscribe_caller')
    expect(JSON.stringify(call.prompt)).toContain('most recent Caller text')
    expect(JSON.stringify(call.prompt)).toContain(
      'verbal yes/no is not signup confirmation'
    )
  })

  it('does not start work for a stale request, closed handoff, or aborted signal', async () => {
    await expect(
      runBellLiveDelegation(input({ isCurrent: () => false }))
    ).resolves.toBe('')
    const actions = actionHandler()
    actions.hasHandedOff.mockReturnValue(true)
    await expect(runBellLiveDelegation(input({ actions }))).resolves.toBe('')
    const controller = new AbortController()
    controller.abort()
    await expect(
      runBellLiveDelegation(input({ signal: controller.signal }))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it.each([
    'start_voicemail',
    'open_signup_menu',
  ])('binds %s to the current call and returns its verified handoff result', async (name) => {
    const actions = actionHandler()
    actions.execute.mockImplementation(async () => {
      actions.hasHandedOff.mockReturnValue(true)
      return {
        status: 'handed_off',
        message: 'The telephone handoff is underway. Stop speaking.',
      }
    })
    mocks.generate.mockResolvedValueOnce(toolResult(name))
    await expect(runBellLiveDelegation(input({ actions }))).resolves.toBe(
      'handed_off: The telephone handoff is underway. Stop speaking.'
    )
    expect(actions.execute).toHaveBeenCalledWith(
      name,
      {},
      3,
      expect.any(Function)
    )
    expect(mocks.generate).toHaveBeenCalledOnce()
  })

  it('rejects tool arguments that attempt to choose a telephone destination', async () => {
    const actions = actionHandler()
    mocks.generate.mockResolvedValueOnce(
      toolResult('start_voicemail', '{"number":"+12125551234"}')
    )
    await runBellLiveDelegation(input({ actions }))
    expect(actions.execute).not.toHaveBeenCalled()
  })

  it('does not execute a model action after a new caller revision supersedes it', async () => {
    let current = true
    const actions = actionHandler()
    mocks.generate.mockImplementationOnce(async () => {
      current = false
      return toolResult('open_signup_menu')
    })
    await expect(
      runBellLiveDelegation(input({ actions, isCurrent: () => current }))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(actions.execute).not.toHaveBeenCalled()
  })

  it('passes cancellation through async verification and discards stale outcomes', async () => {
    let current = true
    const actions = actionHandler()
    actions.execute.mockImplementation(
      async (_name, _args, _turn, isCurrent) => {
        expect(isCurrent?.()).toBe(true)
        current = false
        expect(isCurrent?.()).toBe(false)
        return { status: 'already_subscribed', message: 'You are subscribed.' }
      }
    )
    mocks.generate.mockResolvedValueOnce(toolResult('open_signup_menu'))
    await expect(
      runBellLiveDelegation(input({ actions, isCurrent: () => current }))
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.generate).toHaveBeenCalledOnce()
  })

  it('reserves synthesis time and preserves retrieved evidence', async () => {
    vi.useFakeTimers()
    const request = input()
    mocks.generate.mockResolvedValueOnce(
      toolResult('fetchPost', '{"slug":"coffee"}')
    )
    mocks.read.mockImplementationOnce(async () => {
      vi.setSystemTime(request.deadline - 45_000)
      return { content: 'Evidence that must remain in the final prompt.' }
    })
    await expect(runBellLiveDelegation(request)).resolves.toBe(
      'A sourced answer.'
    )
    expect(mocks.model.doGenerateCalls).toHaveLength(2)
    const final = mocks.model.doGenerateCalls[1]
    expect(final.tools).toBeUndefined()
    expect(final.toolChoice).toEqual({ type: 'none' })
    expect(final.providerOptions?.openai).toMatchObject({
      reasoningEffort: 'low',
      store: false,
    })
    expect(JSON.stringify(final.prompt)).toContain('Evidence that must remain')
    expect(JSON.stringify(final.prompt)).toContain(
      'Research is complete for this delegation'
    )
  })

  it('uses at most nineteen research steps and one compression call', async () => {
    mocks.generate.mockImplementation(async (options) => {
      if (options.tools?.length)
        return toolResult('fetchPost', '{"slug":"coffee"}')
      if (options.maxOutputTokens > 500)
        return textResult('Long factual summary. '.repeat(100), 1_000)
      return textResult('Compressed sourced answer.', 20)
    })
    await expect(runBellLiveDelegation(input())).resolves.toBe(
      'Compressed sourced answer.'
    )
    expect(mocks.generate).toHaveBeenCalledTimes(20)
    expect(mocks.read).toHaveBeenCalledTimes(18)
    const compression = mocks.model.doGenerateCalls.at(-1)
    expect(compression?.reasoning).toBe('none')
    expect(compression?.maxOutputTokens).toBe(480)
    expect(compression?.tools).toBeUndefined()
    expect(compression?.providerOptions?.openai).toMatchObject({ store: false })
  })

  it('compresses high token density and bounds a provider that ignores the character instruction', async () => {
    mocks.generate.mockResolvedValueOnce(textResult('Dense token result.', 501))
    mocks.generate.mockResolvedValueOnce(
      textResult('Evidence '.repeat(300), 480)
    )
    const summary = await runBellLiveDelegation(input())
    expect(summary.length).toBeLessThanOrEqual(BELL_LIVE_SUMMARY_MAX_CHARACTERS)
    expect(summary.endsWith('...')).toBe(true)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
  })

  it('treats empty prose and expired call deadlines as failures', async () => {
    mocks.generate.mockResolvedValueOnce(textResult('  '))
    await expect(runBellLiveDelegation(input())).rejects.toThrow(
      'no factual summary'
    )
    await expect(
      runBellLiveDelegation(input({ deadline: Date.now() - 1 }))
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})
