import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { smsSubscribers, subscribers } from '@/lib/db/schema'
import { callerSubscriptionStatus } from '@/lib/phone/caller-subscription'
import { db, resetDb } from '@/test/integration/db'

const CALLER = '+14155551234'

beforeEach(resetDb)
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('caller SMS subscription status', () => {
  it('recognizes confirmed membership regardless of legacy newsletter flags', async () => {
    await db.insert(smsSubscribers).values({
      phoneNumber: CALLER,
      confirmedAt: new Date(),
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTidbits: false,
      subscribedTsundoku: false,
    })

    expect(await callerSubscriptionStatus(CALLER)).toBe('subscribed')
    expect(await callerSubscriptionStatus('+14155559876')).toBe(
      'not_subscribed'
    )
  })

  it('does not count an unconfirmed SMS row as subscribed', async () => {
    await db.insert(smsSubscribers).values({
      phoneNumber: CALLER,
      confirmedAt: null,
      subscribedPostcard: true,
      subscribedContraption: true,
    })

    expect(await callerSubscriptionStatus(CALLER)).toBe('not_subscribed')
  })

  it('does not infer phone membership from an email subscriber', async () => {
    await db.insert(subscribers).values({
      email: 'caller@example.com',
      confirmedAt: new Date(),
    })

    expect(await callerSubscriptionStatus(CALLER)).toBe('not_subscribed')
  })

  it.each([
    'Unknown',
    'anonymous',
    '',
    '4155551234',
    '+1',
  ])('treats invalid caller ID %j as unknown without querying', async (phoneNumber) => {
    const query = vi.spyOn(db.$client, 'query')

    expect(await callerSubscriptionStatus(phoneNumber)).toBe('unknown')
    expect(query).not.toHaveBeenCalled()
  })

  it('preserves unknown on failure without logging caller or database details', async () => {
    vi.spyOn(db.$client, 'query').mockRejectedValueOnce(
      new Error(`Cannot look up ${CALLER} with private database credentials`)
    )
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(await callerSubscriptionStatus(CALLER)).toBe('unknown')
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      '[phone/caller-subscription] SMS lookup unavailable'
    )
  })

  it('lets calls proceed within one second when the lookup never settles', async () => {
    vi.useFakeTimers()
    vi.spyOn(db.$client, 'query').mockImplementationOnce(
      () => new Promise(() => {})
    )

    const status = callerSubscriptionStatus(CALLER)
    await vi.advanceTimersByTimeAsync(1_000)

    expect(await status).toBe('unknown')
    expect(vi.getTimerCount()).toBe(0)
  })
})
