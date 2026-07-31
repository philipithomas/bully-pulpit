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

export type PhoneWebhookEventAttemptClaim =
  | {
      attemptNumber: number
      outcome: 'claimed'
      processingAt: Date
    }
  | {
      outcome: 'active' | 'completed' | 'exhausted'
    }

/** Atomically acquires or renews an expired lease for one webhook. */
export async function claimPhoneWebhookEvent(
  id: number,
  leaseMs = CLAIM_LEASE_MS
): Promise<Date | null> {
  const staleBefore = new Date(Date.now() - leaseMs)
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

/**
 * Atomically claims one bounded side-effect attempt. The returned attempt
 * number belongs to the lease winner, independent of which request inserted
 * the dedupe row.
 */
export async function claimPhoneWebhookEventAttempt(
  id: number,
  input: { leaseMs: number; maxAttempts: number }
): Promise<PhoneWebhookEventAttemptClaim> {
  const staleBefore = new Date(Date.now() - input.leaseMs)
  const processingAt = new Date()
  const rows = await getDb()
    .update(phoneWebhookEvents)
    .set({
      attemptCount: sql`${phoneWebhookEvents.attemptCount} + 1`,
      processingAt,
    })
    .where(
      and(
        eq(phoneWebhookEvents.id, id),
        isNull(phoneWebhookEvents.processedAt),
        lt(phoneWebhookEvents.attemptCount, input.maxAttempts),
        or(
          isNull(phoneWebhookEvents.processingAt),
          lt(phoneWebhookEvents.processingAt, staleBefore)
        )
      )
    )
    .returning({ attemptNumber: phoneWebhookEvents.attemptCount })
  if (rows[0]) {
    return {
      attemptNumber: rows[0].attemptNumber,
      outcome: 'claimed',
      processingAt,
    }
  }

  const [current] = await getDb()
    .select({
      attemptCount: phoneWebhookEvents.attemptCount,
      processedAt: phoneWebhookEvents.processedAt,
      processingAt: phoneWebhookEvents.processingAt,
    })
    .from(phoneWebhookEvents)
    .where(eq(phoneWebhookEvents.id, id))
    .limit(1)
  if (current?.processedAt) return { outcome: 'completed' }
  if ((current?.attemptCount ?? input.maxAttempts) >= input.maxAttempts) {
    return { outcome: 'exhausted' }
  }
  return { outcome: 'active' }
}

/**
 * Atomically consumes the current lease. Workflows use this as authorization
 * to proceed; synchronous routes may consume after their side effects. A step
 * ID makes the write retry-safe: the same durable step can recover a lost
 * database acknowledgement, while a distinct run stays a loser.
 */
export async function markPhoneWebhookEventProcessed(
  id: number,
  processingAt: Date,
  processedStepId?: string
): Promise<boolean> {
  const rows = await getDb()
    .update(phoneWebhookEvents)
    .set({
      processingAt: null,
      processedAt: sql`NOW()`,
      ...(processedStepId ? { processedStepId } : {}),
    })
    .where(
      and(
        eq(phoneWebhookEvents.id, id),
        eq(phoneWebhookEvents.processingAt, processingAt),
        isNull(phoneWebhookEvents.processedAt)
      )
    )
    .returning({ id: phoneWebhookEvents.id })
  if (rows.length > 0) return true
  if (!processedStepId) return false

  const completedByThisStep = await getDb()
    .select({ id: phoneWebhookEvents.id })
    .from(phoneWebhookEvents)
    .where(
      and(
        eq(phoneWebhookEvents.id, id),
        eq(phoneWebhookEvents.processedStepId, processedStepId)
      )
    )
    .limit(1)
  return completedByThisStep.length > 0
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
