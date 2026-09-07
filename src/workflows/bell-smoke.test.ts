import { generateText } from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bellSmokeStep } from '@/workflows/bell-smoke'

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: vi.fn(),
}))

const mockedGenerate = vi.mocked(generateText)

function generation(overrides: Record<string, unknown> = {}) {
  return {
    text: 'This is Philip Ilic Thomas’s website.',
    finishReason: 'stop',
    response: { modelId: 'test-model' },
    steps: [
      {
        toolResults: [
          {
            toolName: 'fetchPage',
            input: { path: '/' },
            output: JSON.stringify({
              type: 'page',
              url: '/',
              title: 'Philip Ilic Thomas',
              content: 'Personal website of Philip Ilic Thomas.',
            }),
          },
        ],
        providerMetadata: { gateway: { enabledZeroDataRetention: true } },
      },
      {
        toolResults: [],
        providerMetadata: { gateway: { enabledZeroDataRetention: true } },
      },
    ],
    ...overrides,
  } as unknown as Awaited<ReturnType<typeof generateText>>
}

beforeEach(() => {
  mockedGenerate.mockReset()
})

describe('Bell workflow smoke', () => {
  it('reports verified archive access and privacy without returning conversation text', async () => {
    mockedGenerate.mockResolvedValue(generation())
    await expect(bellSmokeStep()).resolves.toEqual({
      model: 'test-model',
      steps: 2,
      archiveRead: true,
      zeroDataRetention: true,
      checkedAt: expect.any(String),
    })
    expect(mockedGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning: 'xhigh',
        providerOptions: expect.objectContaining({
          gateway: expect.objectContaining({ zeroDataRetention: true }),
        }),
      })
    )
  })

  it.each([
    { text: '' },
    { finishReason: 'length' },
  ])('fails for an incomplete answer: %j', async (overrides) => {
    mockedGenerate.mockResolvedValue(generation(overrides))
    await expect(bellSmokeStep()).rejects.toThrow('complete answer')
  })

  it('fails if the model bypasses archive reading', async () => {
    mockedGenerate.mockResolvedValue(
      generation({ steps: [{ toolResults: [] }] })
    )
    await expect(bellSmokeStep()).rejects.toThrow('archive tool')
  })

  it('fails if any model step does not confirm zero data retention', async () => {
    const result = generation()
    mockedGenerate.mockResolvedValue(
      generation({
        steps: result.steps.map((step) => ({ ...step, providerMetadata: {} })),
      })
    )
    await expect(bellSmokeStep()).rejects.toThrow('zero data retention')
  })

  it('fails when a tool result exists but reading the homepage failed', async () => {
    mockedGenerate.mockResolvedValue(
      generation({
        steps: [
          {
            toolResults: [
              {
                toolName: 'fetchPage',
                input: { path: '/' },
                output: JSON.stringify({
                  error: 'No page exists at that path.',
                }),
              },
            ],
          },
        ],
      })
    )
    await expect(bellSmokeStep()).rejects.toThrow('archive tool')
  })

  it('propagates provider failure so the workflow cannot falsely report healthy', async () => {
    mockedGenerate.mockRejectedValue(new Error('Provider unavailable'))
    await expect(bellSmokeStep()).rejects.toThrow('Provider unavailable')
  })
})
