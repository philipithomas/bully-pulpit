import { gateway } from '@ai-sdk/gateway'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  bellGatewayCost,
  gatewayGenerationIdFromMetadata,
  getBellProviderOptions,
} from '@/lib/chat/bell-generation'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Bell Gateway metadata', () => {
  it('enables zero-data retention and uses only low-cardinality tags', () => {
    const options = getBellProviderOptions({
      surface: 'web',
      pseudonymousUser: 'subscriber:reader-uuid',
    })

    expect(options.gateway).toMatchObject({
      zeroDataRetention: true,
      user: 'subscriber:reader-uuid',
      tags: [
        'feature:bell',
        'surface:web',
        expect.stringMatching(/^env:(production|preview|development)$/),
      ],
    })
    expect(options.gateway.tags).not.toContain('subscriber:reader-uuid')
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
