import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@vercel/firewall', () => ({ checkRateLimit: vi.fn() }))

import { checkRateLimit as vercelCheckRateLimit } from '@vercel/firewall'
import { checkRateLimit, checkRateLimitStatus } from '@/lib/rate-limit'

const firewall = vi.mocked(vercelCheckRateLimit)
const request = new Request('https://example.com/api/test')
const originalVercel = process.env.VERCEL

describe('rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VERCEL = '1'
  })

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = originalVercel
  })

  it('reports allowed and limited Firewall decisions', async () => {
    firewall.mockResolvedValueOnce({ rateLimited: false })
    await expect(
      checkRateLimitStatus('search', 'ip:203.0.113.1', request)
    ).resolves.toBe('allowed')

    firewall.mockResolvedValueOnce({ rateLimited: true })
    await expect(
      checkRateLimitStatus('search', 'ip:203.0.113.1', request)
    ).resolves.toBe('limited')
  })

  it('reports unavailable when the Firewall self-fetch fails', async () => {
    firewall.mockRejectedValueOnce(new Error('unavailable'))

    await expect(
      checkRateLimitStatus('chat', 'ip:203.0.113.1', request)
    ).resolves.toBe('unavailable')
  })

  it('reports unavailable when the configured rule ID is missing', async () => {
    firewall.mockResolvedValueOnce({
      rateLimited: false,
      error: 'not-found',
    })

    await expect(
      checkRateLimitStatus('search', 'ip:203.0.113.1', request)
    ).resolves.toBe('unavailable')
  })

  it('keeps the boolean helper fail-open for existing callers', async () => {
    firewall.mockRejectedValueOnce(new Error('unavailable'))
    await expect(
      checkRateLimit('subscribe', 'email:reader@example.com', request)
    ).resolves.toBe(true)

    firewall.mockResolvedValueOnce({ rateLimited: true })
    await expect(
      checkRateLimit('subscribe', 'email:reader@example.com', request)
    ).resolves.toBe(false)
  })

  it('allows local requests without calling the Firewall', async () => {
    delete process.env.VERCEL

    await expect(
      checkRateLimitStatus('search', 'ip:127.0.0.1', request)
    ).resolves.toBe('allowed')
    expect(firewall).not.toHaveBeenCalled()
  })
})
