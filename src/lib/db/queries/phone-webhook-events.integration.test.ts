import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  claimPhoneWebhookEvent,
  claimPhoneWebhookEventAttempt,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import { phoneWebhookEvents } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

afterEach(() => vi.useRealTimers())

describe('phone webhook event completion', () => {
  it('replays a lost step acknowledgement without admitting another run', async () => {
    await resetDb()
    const { event } = await findOrCreatePhoneWebhookEvent({
      eventKey: 'recording:RE123',
      eventType: 'recording-status',
    })
    const lease = await claimPhoneWebhookEvent(event.id)
    expect(lease).not.toBeNull()

    expect(
      await markPhoneWebhookEventProcessed(
        event.id,
        lease as Date,
        'step/winner'
      )
    ).toBe(true)
    // Simulate the database commit succeeding but its result never reaching the
    // Workflow runtime. Retrying the same stable step ID must recover success.
    expect(
      await markPhoneWebhookEventProcessed(
        event.id,
        lease as Date,
        'step/winner'
      )
    ).toBe(true)
    expect(
      await markPhoneWebhookEventProcessed(
        event.id,
        lease as Date,
        'step/competing-run'
      )
    ).toBe(false)

    const [stored] = await db.select().from(phoneWebhookEvents)
    expect(stored).toMatchObject({
      id: event.id,
      processingAt: null,
      processedStepId: 'step/winner',
    })
    expect(stored.processedAt).toBeInstanceOf(Date)
  })

  it('atomically bounds side-effect attempts independently of row insertion', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'))
    await resetDb()
    const { event } = await findOrCreatePhoneWebhookEvent({
      eventKey: 'bell-live-greeting:CA123',
      eventType: 'bell-live-greeting',
    })

    const first = await claimPhoneWebhookEventAttempt(event.id, {
      leaseMs: 6_000,
      maxAttempts: 2,
    })
    expect(first).toMatchObject({ outcome: 'claimed', attemptNumber: 1 })

    await expect(
      claimPhoneWebhookEventAttempt(event.id, {
        leaseMs: 6_000,
        maxAttempts: 2,
      })
    ).resolves.toEqual({ outcome: 'active' })

    vi.advanceTimersByTime(7_000)

    const second = await claimPhoneWebhookEventAttempt(event.id, {
      leaseMs: 6_000,
      maxAttempts: 2,
    })
    expect(second).toMatchObject({ outcome: 'claimed', attemptNumber: 2 })
    if (second.outcome !== 'claimed') throw new Error('Expected second claim')
    await releasePhoneWebhookEvent(event.id, second.processingAt)

    await expect(
      claimPhoneWebhookEventAttempt(event.id, {
        leaseMs: 6_000,
        maxAttempts: 2,
      })
    ).resolves.toEqual({ outcome: 'exhausted' })
    vi.useRealTimers()
  })
})
