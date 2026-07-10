import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
} from '@/lib/db/queries/phone-webhook-events'
import { phoneWebhookEvents } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

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
})
