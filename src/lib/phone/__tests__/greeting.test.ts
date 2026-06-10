import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', () => ({
  generateText: vi.fn(),
}))
vi.mock('@ai-sdk/gateway', () => ({
  gateway: vi.fn((id: string) => id),
}))

import { generateText } from 'ai'
import { FALLBACK_GREETING, generateGreeting } from '@/lib/phone/greeting'

const mockedGenerateText = vi.mocked(generateText)

describe('generateGreeting', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the model greeting trimmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('☀️ +72°F ↗11mph'))
    )
    mockedGenerateText.mockResolvedValueOnce({
      text: '  You have reached the Contraption Company. Leave a message after the tone.  ',
      // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    } as any)
    await expect(generateGreeting()).resolves.toBe(
      'You have reached the Contraption Company. Leave a message after the tone.'
    )
  })

  it('passes NYC time and weather to the model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('rainy +55°F'))
    )
    // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    mockedGenerateText.mockResolvedValueOnce({ text: 'Hello.' } as any)
    await generateGreeting(new Date('2026-03-14T17:00:00Z'))
    const call = mockedGenerateText.mock.calls[0][0]
    expect(call.prompt).toContain('Current weather: rainy +55°F')
    // 17:00 UTC on 2026-03-14 is 13:00 in New York (EDT).
    expect(call.prompt).toContain('Saturday, March 14, 2026 at 1:00 PM')
  })

  it('falls back to the static greeting when the gateway fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown'))
    )
    mockedGenerateText.mockRejectedValueOnce(new Error('gateway down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(generateGreeting()).resolves.toBe(FALLBACK_GREETING)
    expect(consoleError).toHaveBeenCalled()
  })

  it('falls back to the static greeting when the gateway call times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown'))
    )
    // AbortSignal.timeout rejects the pending call with a TimeoutError
    // DOMException; the catch path must treat it like any other failure.
    mockedGenerateText.mockRejectedValueOnce(
      new DOMException(
        'The operation was aborted due to timeout',
        'TimeoutError'
      )
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(generateGreeting()).resolves.toBe(FALLBACK_GREETING)
    expect(consoleError).toHaveBeenCalled()
  })

  it('bounds the gateway call with an abort timeout and no retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown'))
    )
    // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    mockedGenerateText.mockResolvedValueOnce({ text: 'Hello.' } as any)
    await generateGreeting()
    const call = mockedGenerateText.mock.calls[0][0]
    expect(call.abortSignal).toBeInstanceOf(AbortSignal)
    expect(call.maxRetries).toBe(0)
  })

  it('falls back when the model returns empty text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown'))
    )
    // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    mockedGenerateText.mockResolvedValueOnce({ text: '   ' } as any)
    await expect(generateGreeting()).resolves.toBe(FALLBACK_GREETING)
  })

  it('survives a weather fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      })
    )
    // biome-ignore lint/suspicious/noExplicitAny: partial generateText result
    mockedGenerateText.mockResolvedValueOnce({ text: 'Hello.' } as any)
    await expect(generateGreeting()).resolves.toBe('Hello.')
    const call = mockedGenerateText.mock.calls[0][0]
    expect(call.prompt).toContain('Current weather: unknown')
  })
})
