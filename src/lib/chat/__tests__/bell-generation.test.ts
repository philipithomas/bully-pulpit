import { gateway } from '@ai-sdk/gateway'
import { generateText, streamText, type TextStreamPart, tool } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import {
  BELL_FINAL_ANSWER_RESERVE_MS,
  BELL_MAX_OUTPUT_TOKENS,
  BELL_MODEL_ID,
  BELL_SMS_MAX_STEPS,
  BELL_SMS_TIMEOUT_MS,
  BELL_WEB_MAX_STEPS,
  bellGatewayCost,
  bellSmsStopWhen,
  bellTools,
  bellWebStopWhen,
  createBellPrepareStep,
  gatewayGenerationIdFromMetadata,
  getBellProviderOptions,
  getBellReasoning,
  prepareBellSmsStep,
  prepareBellWebStep,
  requireBellAnswer,
} from '@/lib/chat/bell-generation'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Bell Gateway metadata', () => {
  it('uses GPT-5.6 Sol fast serving with surface-specific reasoning', () => {
    expect(BELL_MODEL_ID).toBe('openai/gpt-5.6-sol-fast')
    expect(getBellReasoning('web')).toBe('high')
    expect(getBellReasoning('web', 2)).toBe('high')
    expect(getBellReasoning('web', 8)).toBe('high')
    expect(getBellReasoning('sms')).toBe('xhigh')
  })

  it('registers chronology, relevance search, and reading tools', () => {
    expect(Object.keys(bellTools)).toEqual([
      'listPosts',
      'searchPosts',
      'fetchPost',
      'fetchPage',
      'fetchPublicUrl',
    ])
  })

  it('allows deep web research while reserving each final step for prose', () => {
    expect(BELL_WEB_MAX_STEPS).toBe(20)
    expect(
      bellWebStopWhen({ steps: Array.from({ length: 19 }) as never })
    ).toBe(false)
    expect(
      bellWebStopWhen({ steps: Array.from({ length: 20 }) as never })
    ).toBe(true)
    expect(prepareBellWebStep({ stepNumber: 18 })).toBeUndefined()
    expect(prepareBellWebStep({ stepNumber: 19 })).toMatchObject({
      activeTools: [],
      toolChoice: 'none',
    })

    expect(BELL_SMS_MAX_STEPS).toBe(20)
    expect(
      bellSmsStopWhen({ steps: Array.from({ length: 20 }) as never })
    ).toBe(true)
    expect(prepareBellSmsStep({ stepNumber: 19 })).toMatchObject({
      activeTools: [],
      toolChoice: 'none',
    })
  })

  it('enables zero-data retention and uses only low-cardinality tags', () => {
    const options = getBellProviderOptions({
      surface: 'web',
      pseudonymousUser: 'subscriber:reader-uuid',
    })

    expect(options.gateway).toMatchObject({
      order: ['openai'],
      serviceTier: 'priority',
      zeroDataRetention: true,
      user: 'subscriber:reader-uuid',
      tags: [
        'feature:bell',
        'surface:web',
        expect.stringMatching(/^env:(production|preview|development)$/),
      ],
    })
    // OpenAI can temporarily be ineligible for ZDR even while Azure serves
    // the same model with zero retention. Never pin to an ineligible host.
    expect('only' in options.gateway).toBe(false)
    expect(options.gateway.tags).not.toContain('subscriber:reader-uuid')
    expect('models' in options.gateway).toBe(false)
  })

  it('does not request priority service outside web Bell', () => {
    const gateway = getBellProviderOptions({ surface: 'sms' }).gateway
    expect('only' in gateway).toBe(false)
    expect('serviceTier' in gateway).toBe(false)
  })

  it.each([
    'web',
    'sms',
  ] as const)('requests fast serving on %s while retaining automatic base-tier fallback', (surface) => {
    const options = getBellProviderOptions({ surface })
    expect(options.gateway.speed).toBe('fast')
    expect('only' in options.gateway).toBe(false)
    expect(options.gateway.zeroDataRetention).toBe(true)
    expect('allowFallbackFromFast' in options.gateway).toBe(false)
    expect('models' in options.gateway).toBe(false)
  })

  it('does not manufacture a user when no attribution is available', () => {
    const gateway = getBellProviderOptions({ surface: 'web' }).gateway
    expect('user' in gateway).toBe(false)
  })

  it('extracts only the Gateway generation ID', () => {
    expect(
      gatewayGenerationIdFromMetadata({
        gateway: { generationId: 'gen_123', other: 'ignored' },
      })
    ).toBe('gen_123')
    expect(gatewayGenerationIdFromMetadata({ gateway: null })).toBeNull()
    expect(gatewayGenerationIdFromMetadata('gen_123')).toBeNull()
  })

  it('retries a generation cost while the Gateway billing record settles', async () => {
    vi.useFakeTimers()
    const getGenerationInfo = vi
      .spyOn(gateway, 'getGenerationInfo')
      .mockRejectedValueOnce(new Error('Generation not ready'))
      .mockRejectedValueOnce(new Error('Generation not ready'))
      .mockResolvedValue({
        totalCost: 0.0123,
      } as Awaited<ReturnType<typeof gateway.getGenerationInfo>>)

    const costPromise = bellGatewayCost([
      { gateway: { generationId: 'gen_123' } },
    ])
    await vi.runAllTimersAsync()

    await expect(costPromise).resolves.toEqual({
      gatewayGenerationId: 'gen_123',
      costUsd: 0.0123,
    })
    expect(getGenerationInfo).toHaveBeenCalledTimes(3)
    expect(getGenerationInfo).toHaveBeenNthCalledWith(1, { id: 'gen_123' })
    expect(getGenerationInfo).toHaveBeenNthCalledWith(2, { id: 'gen_123' })
    expect(getGenerationInfo).toHaveBeenNthCalledWith(3, { id: 'gen_123' })
  })

  it('returns within one second when Gateway lookups do not settle', async () => {
    vi.useFakeTimers()
    vi.spyOn(gateway, 'getGenerationInfo').mockImplementation(
      () =>
        new Promise<Awaited<ReturnType<typeof gateway.getGenerationInfo>>>(
          () => {}
        )
    )
    const startedAt = Date.now()

    const costPromise = bellGatewayCost([
      { gateway: { generationId: 'gen_never_ready' } },
    ])
    await vi.runAllTimersAsync()

    await expect(costPromise).resolves.toEqual({
      gatewayGenerationId: 'gen_never_ready',
      costUsd: null,
    })
    expect(Date.now() - startedAt).toBeLessThan(1000)
    expect(gateway.getGenerationInfo).toHaveBeenCalledTimes(3)
  })

  it('aggregates every unique Gateway generation in a tool loop', async () => {
    const getGenerationInfo = vi
      .spyOn(gateway, 'getGenerationInfo')
      .mockImplementation(async ({ id }) => {
        const totalCost = id === 'gen_first' ? 0.01 : 0.02
        return { totalCost } as Awaited<
          ReturnType<typeof gateway.getGenerationInfo>
        >
      })

    await expect(
      bellGatewayCost([
        { gateway: { generationId: 'gen_first' } },
        { gateway: { generationId: 'gen_first' } },
        { gateway: { generationId: 'gen_last' } },
      ])
    ).resolves.toEqual({
      gatewayGenerationId: 'gen_last',
      costUsd: 0.03,
    })
    expect(getGenerationInfo).toHaveBeenCalledTimes(2)
  })

  it('does not persist a partial cost when one tool-loop generation stays unresolved', async () => {
    vi.useFakeTimers()
    const getGenerationInfo = vi
      .spyOn(gateway, 'getGenerationInfo')
      .mockImplementation(async ({ id }) => {
        if (id === 'gen_resolved') {
          return { totalCost: 0.01 } as Awaited<
            ReturnType<typeof gateway.getGenerationInfo>
          >
        }
        throw new Error('Generation not ready')
      })

    const costPromise = bellGatewayCost([
      { gateway: { generationId: 'gen_resolved' } },
      { gateway: { generationId: 'gen_unresolved' } },
    ])
    await vi.runAllTimersAsync()

    await expect(costPromise).resolves.toEqual({
      gatewayGenerationId: 'gen_unresolved',
      costUsd: null,
    })
    expect(getGenerationInfo).toHaveBeenCalledTimes(4)
    expect(getGenerationInfo).toHaveBeenCalledWith({ id: 'gen_resolved' })
  })
})

describe('Bell bounded research', () => {
  it('preserves completed research and requests synthesis before the SMS deadline', async () => {
    vi.useFakeTimers()
    const startedAt = Date.now()
    const prepareStep = createBellPrepareStep('sms', startedAt)
    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 5, reasoning: 5 },
    }
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (options.tools?.length) {
          return {
            content: [
              {
                type: 'tool-call',
                toolCallId: 'read-1',
                toolName: 'read',
                input: '{}',
              },
            ],
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
            warnings: [],
          }
        }
        return {
          content: [
            { type: 'text', text: 'The archive supports a considered answer.' },
          ],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        }
      },
    })
    const read = vi.fn(async () => {
      vi.setSystemTime(
        startedAt + BELL_SMS_TIMEOUT_MS - BELL_FINAL_ANSWER_RESERVE_MS
      )
      return { title: 'A useful post', content: 'Distinct archive evidence.' }
    })
    const result = await generateText({
      model,
      prompt: 'Research the subject.',
      reasoning: 'xhigh',
      maxOutputTokens: BELL_MAX_OUTPUT_TOKENS,
      tools: { read: tool({ inputSchema: z.object({}), execute: read }) },
      stopWhen: bellSmsStopWhen,
      prepareStep,
    })
    expect(result.text).toBe('The archive supports a considered answer.')
    expect(read).toHaveBeenCalledOnce()
    expect(model.doGenerateCalls).toHaveLength(2)
    const finalCall = model.doGenerateCalls[1]
    expect(finalCall.tools).toBeUndefined()
    expect(finalCall.providerOptions?.openai).toMatchObject({
      reasoningEffort: 'low',
    })
    expect(JSON.stringify(finalCall.prompt)).toContain(
      'Distinct archive evidence.'
    )
    expect(JSON.stringify(finalCall.prompt)).toContain(
      'Write the final answer now'
    )
  })
})

describe('Bell empty streaming answers', () => {
  async function transform(parts: Array<TextStreamPart<typeof bellTools>>) {
    const input = new ReadableStream<TextStreamPart<typeof bellTools>>({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    })
    const transformed = input.pipeThrough(
      requireBellAnswer({ tools: bellTools, stopStream: vi.fn() })
    )
    const reader = transformed.getReader()
    const output: Array<TextStreamPart<typeof bellTools>> = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      output.push(value)
    }
    return output
  }
  const finish = {
    type: 'finish',
    finishReason: 'length',
    totalUsage: {},
  } as TextStreamPart<typeof bellTools>

  it('reports an empty final answer as an error after earlier research commentary', async () => {
    const output = await transform([
      { type: 'text-delta', id: 'research', text: 'I will read the archive.' },
      { type: 'start-step' } as TextStreamPart<typeof bellTools>,
      { type: 'text-delta', id: 'answer', text: '   ' },
      finish,
    ])
    expect(output.at(-2)).toMatchObject({
      type: 'error',
      error: expect.any(Error),
    })
    expect(output.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: 'error',
    })
  })

  it('sends the browser an error before SDK onEnd for reasoning-only output', async () => {
    const onError = vi.fn()
    const onEnd = vi.fn()
    const model = new MockLanguageModelV4({
      doStream: {
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] })
            controller.enqueue({ type: 'reasoning-start', id: 'reasoning' })
            controller.enqueue({
              type: 'reasoning-delta',
              id: 'reasoning',
              delta: 'Internal research.',
            })
            controller.enqueue({ type: 'reasoning-end', id: 'reasoning' })
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'length', raw: 'max_output_tokens' },
              usage: {
                inputTokens: {
                  total: 10,
                  noCache: 10,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 100, text: 0, reasoning: 100 },
              },
            })
            controller.close()
          },
        }),
      },
    })
    const result = streamText({
      model,
      prompt: 'Research the archive.',
      tools: bellTools,
      experimental_transform: requireBellAnswer,
      onError,
      onEnd,
    })
    const response = result.toUIMessageStreamResponse({
      sendReasoning: false,
      onError: () => 'Please try again.',
    })
    const body = await response.text()
    expect(body).toContain('Please try again.')
    expect(body).not.toContain('Internal research.')
    expect(onError).toHaveBeenCalledOnce()
    // AI SDK onEnd reports the last provider step's finish reason, even when
    // a later transform reports an error. The route must preserve onError.
    expect(onEnd).toHaveBeenCalledWith(
      expect.objectContaining({ finishReason: 'length', text: '' })
    )
    expect(onError.mock.invocationCallOrder[0]).toBeLessThan(
      onEnd.mock.invocationCallOrder[0]
    )
  })

  it('preserves real answers and does not duplicate provider errors', async () => {
    const text = {
      type: 'text-delta',
      id: 'answer',
      text: 'A sourced answer.',
    } as const
    expect(await transform([text, finish])).toEqual([text, finish])
    const error = {
      type: 'error',
      error: new Error('Provider unavailable'),
    } as const
    expect(await transform([error, finish])).toEqual([error, finish])
  })
})
