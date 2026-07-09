import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { type PhoneWebhookEvent, phoneWebhookEvents } from '@/lib/db/schema'

export async function findOrCreatePhoneWebhookEvent(input: {
  eventKey: string
  eventType: string
}): Promise<{ event: PhoneWebhookEvent; inserted: boolean }> {
  const inserted = await getDb()
    .insert(phoneWebhookEvents)
    .values(input)
    .onConflictDoNothing({ target: phoneWebhookEvents.eventKey })
    .returning()
  if (inserted.length > 0) return { event: inserted[0], inserted: true }

  const existing = await getDb()
    .select()
    .from(phoneWebhookEvents)
    .where(eq(phoneWebhookEvents.eventKey, input.eventKey))
    .limit(1)
  return { event: existing[0], inserted: false }
}

const CLAIM_LEASE_MS = 2 * 60 * 1000

/** Atomically acquires or renews an expired lease for one webhook. */
export async function claimPhoneWebhookEvent(id: number): Promise<Date | null> {
  const staleBefore = new Date(Date.now() - CLAIM_LEASE_MS)
  const processingAt = new Date()
  const rows = await getDb()
    .update(phoneWebhookEvents)
    .set({ processingAt })
    .where(
      and(
        eq(phoneWebhookEvents.id, id),
        isNull(phoneWebhookEvents.processedAt),
        or(
          isNull(phoneWebhookEvents.processingAt),
          lt(phoneWebhookEvents.processingAt, staleBefore)
        )
      )
    )
    .returning({ id: phoneWebhookEvents.id })
  return rows.length > 0 ? processingAt : null
}

/** Marks the accepted side effects complete, but only for the current lease. */
export async function markPhoneWebhookEventProcessed(
  id: number,
  processingAt: Date
): Promise<boolean> {
  const rows = await getDb()
    .update(phoneWebhookEvents)
    .set({ processingAt: null, processedAt: sql`NOW()` })
    .where(
      and(
        eq(phoneWebhookEvents.id, id),
        eq(phoneWebhookEvents.processingAt, processingAt),
        isNull(phoneWebhookEvents.processedAt)
      )
    )
    .returning({ id: phoneWebhookEvents.id })
  return rows.length > 0
}

/** Releases the current lease when notification or workflow enqueue fails. */
export async function releasePhoneWebhookEvent(
  id: number,
  processingAt: Date
): Promise<void> {
  await getDb()
    .update(phoneWebhookEvents)
    .set({ processingAt: null })
    .where(
      and(
        eq(phoneWebhookEvents.id, id),
        eq(phoneWebhookEvents.processingAt, processingAt),
        isNull(phoneWebhookEvents.processedAt)
      )
    )
}
