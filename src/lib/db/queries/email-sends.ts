import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { type EmailSend, emailSends, subscribers } from '@/lib/db/schema'

const INSERT_CHUNK = 500

export async function findByUnsubscribeToken(
  token: string
): Promise<EmailSend | null> {
  const rows = await getDb()
    .select()
    .from(emailSends)
    .where(eq(emailSends.unsubscribeToken, token))
    .limit(1)
  return rows[0] ?? null
}

export async function markUnsubscribed(id: number): Promise<void> {
  await getDb()
    .update(emailSends)
    .set({ triggeredUnsubscribeAt: sql`NOW()` })
    .where(eq(emailSends.id, id))
}

/**
 * Inserts one queued email_sends row per subscriber for a post and returns the
 * created row ids. Chunked to stay well under Postgres parameter limits.
 */
export async function bulkCreateQueued(input: {
  subscriberIds: number[]
  postSlug: string
  newsletter: string
  subject: string
  htmlContent: string
  previewText?: string | null
}): Promise<number[]> {
  const ids: number[] = []
  for (let i = 0; i < input.subscriberIds.length; i += INSERT_CHUNK) {
    const chunk = input.subscriberIds.slice(i, i + INSERT_CHUNK)
    const rows = await getDb()
      .insert(emailSends)
      .values(
        chunk.map((subscriberId) => ({
          subscriberId,
          postSlug: input.postSlug,
          newsletter: input.newsletter,
          subject: input.subject,
          htmlContent: input.htmlContent,
          previewText: input.previewText ?? null,
          nextAttemptAt: sql`NOW()`,
        }))
      )
      .returning({ id: emailSends.id })
    ids.push(...rows.map((r) => r.id))
  }
  return ids
}

export type ClaimedSend = { send: EmailSend; email: string }

/**
 * Re-reads which of the given rows are still sendable (not sent, no error),
 * joined to the recipient email. Called at the top of each send step so retries
 * never re-send an already-sent row.
 */
export async function findSendableByIds(ids: number[]): Promise<ClaimedSend[]> {
  if (ids.length === 0) return []
  const rows = await getDb()
    .select({ send: emailSends, email: subscribers.email })
    .from(emailSends)
    .innerJoin(subscribers, eq(emailSends.subscriberId, subscribers.id))
    .where(
      and(
        inArray(emailSends.id, ids),
        isNull(emailSends.sentAt),
        isNull(emailSends.sendError)
      )
    )
  return rows
}

export async function markSent(id: number): Promise<void> {
  await getDb()
    .update(emailSends)
    .set({ sentAt: sql`NOW()`, sendError: null })
    .where(eq(emailSends.id, id))
}

export async function markPermanentFailure(
  id: number,
  error: string
): Promise<void> {
  await getDb()
    .update(emailSends)
    .set({ sendError: error, attempts: sql`${emailSends.attempts} + 1` })
    .where(eq(emailSends.id, id))
}

export type SendStats = {
  total: number
  sent: number
  pending: number
  failed: number
}

export async function sendStatsBySlug(slug: string): Promise<SendStats> {
  const rows = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`(count(*) FILTER (WHERE ${emailSends.sentAt} IS NOT NULL))::int`,
      failed: sql<number>`(count(*) FILTER (WHERE ${emailSends.sendError} IS NOT NULL AND ${emailSends.sentAt} IS NULL))::int`,
      pending: sql<number>`(count(*) FILTER (WHERE ${emailSends.sentAt} IS NULL AND ${emailSends.sendError} IS NULL))::int`,
    })
    .from(emailSends)
    .where(eq(emailSends.postSlug, slug))
  return rows[0] ?? { total: 0, sent: 0, pending: 0, failed: 0 }
}

/** Ids of rows for a post still awaiting send (not sent, no error). */
export async function pendingRowIdsBySlug(slug: string): Promise<number[]> {
  const rows = await getDb()
    .select({ id: emailSends.id })
    .from(emailSends)
    .where(
      and(
        eq(emailSends.postSlug, slug),
        isNull(emailSends.sentAt),
        isNull(emailSends.sendError)
      )
    )
    .orderBy(emailSends.id)
  return rows.map((r) => r.id)
}

/** Clears send_error on a post's failed rows so they become sendable again. */
export async function resetFailedBySlug(slug: string): Promise<number> {
  const rows = await getDb()
    .update(emailSends)
    .set({ sendError: null, nextAttemptAt: sql`NOW()` })
    .where(
      and(
        eq(emailSends.postSlug, slug),
        isNull(emailSends.sentAt),
        isNotNull(emailSends.sendError)
      )
    )
    .returning({ id: emailSends.id })
  return rows.length
}

/** Send stats grouped by post slug, for the admin dashboard (one query). */
export async function allSendStats(): Promise<Record<string, SendStats>> {
  const rows = await getDb()
    .select({
      slug: emailSends.postSlug,
      total: sql<number>`count(*)::int`,
      sent: sql<number>`(count(*) FILTER (WHERE ${emailSends.sentAt} IS NOT NULL))::int`,
      failed: sql<number>`(count(*) FILTER (WHERE ${emailSends.sendError} IS NOT NULL AND ${emailSends.sentAt} IS NULL))::int`,
      pending: sql<number>`(count(*) FILTER (WHERE ${emailSends.sentAt} IS NULL AND ${emailSends.sendError} IS NULL))::int`,
    })
    .from(emailSends)
    .groupBy(emailSends.postSlug)
  const map: Record<string, SendStats> = {}
  for (const r of rows) {
    map[r.slug] = {
      total: r.total,
      sent: r.sent,
      pending: r.pending,
      failed: r.failed,
    }
  }
  return map
}

export async function countPendingBySlug(slug: string): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(emailSends)
    .where(
      and(
        eq(emailSends.postSlug, slug),
        isNull(emailSends.sentAt),
        isNull(emailSends.sendError)
      )
    )
  return rows[0]?.count ?? 0
}
