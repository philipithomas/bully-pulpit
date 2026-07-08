import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { type SmsSend, smsSends, smsSubscribers } from '@/lib/db/schema'

const INSERT_CHUNK = 500
export const SMS_SEND_SKIPPED_UNSUBSCRIBED =
  'Skipped: unsubscribed before SMS send'

export async function bulkCreateQueuedSms(input: {
  smsSubscriberIds: number[]
  postSlug: string
  newsletter: string
  body: string
}): Promise<number[]> {
  const ids: number[] = []
  for (let i = 0; i < input.smsSubscriberIds.length; i += INSERT_CHUNK) {
    const chunk = input.smsSubscriberIds.slice(i, i + INSERT_CHUNK)
    const rows = await getDb()
      .insert(smsSends)
      .values(
        chunk.map((smsSubscriberId) => ({
          smsSubscriberId,
          postSlug: input.postSlug,
          newsletter: input.newsletter,
          body: input.body,
          nextAttemptAt: sql`NOW()`,
        }))
      )
      .onConflictDoNothing({
        target: [smsSends.smsSubscriberId, smsSends.postSlug],
      })
      .returning({ id: smsSends.id })
    ids.push(...rows.map((r) => r.id))
  }
  return ids
}

export type ClaimedSmsSend = { send: SmsSend; phoneNumber: string }

export async function findSendableSmsByIds(
  ids: number[]
): Promise<ClaimedSmsSend[]> {
  if (ids.length === 0) return []
  const rows = await getDb()
    .select({ send: smsSends, phoneNumber: smsSubscribers.phoneNumber })
    .from(smsSends)
    .innerJoin(smsSubscribers, eq(smsSends.smsSubscriberId, smsSubscribers.id))
    .where(
      and(
        inArray(smsSends.id, ids),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError),
        isNotNull(smsSubscribers.confirmedAt)
      )
    )
  return rows
}

export async function markSmsSent(input: {
  id: number
  twilioSid: string
  twilioStatus: string
}): Promise<void> {
  await getDb()
    .update(smsSends)
    .set({
      sentAt: sql`NOW()`,
      sendError: null,
      twilioSid: input.twilioSid,
      twilioStatus: input.twilioStatus,
    })
    .where(eq(smsSends.id, input.id))
}

export async function markSmsPermanentFailure(
  id: number,
  error: string
): Promise<void> {
  await getDb()
    .update(smsSends)
    .set({ sendError: error, attempts: sql`${smsSends.attempts} + 1` })
    .where(eq(smsSends.id, id))
}

export type SmsSendStats = {
  total: number
  sent: number
  pending: number
  failed: number
}

export async function smsSendStatsBySlug(slug: string): Promise<SmsSendStats> {
  const rows = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`(count(*) FILTER (WHERE ${smsSends.sentAt} IS NOT NULL))::int`,
      failed: sql<number>`(count(*) FILTER (WHERE ${smsSends.sendError} IS NOT NULL AND ${smsSends.sentAt} IS NULL))::int`,
      pending: sql<number>`(count(*) FILTER (WHERE ${smsSends.sentAt} IS NULL AND ${smsSends.sendError} IS NULL))::int`,
    })
    .from(smsSends)
    .where(eq(smsSends.postSlug, slug))
  return rows[0] ?? { total: 0, sent: 0, pending: 0, failed: 0 }
}

export async function pendingSmsRowIdsBySlug(slug: string): Promise<number[]> {
  const rows = await getDb()
    .select({ id: smsSends.id })
    .from(smsSends)
    .where(
      and(
        eq(smsSends.postSlug, slug),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError)
      )
    )
    .orderBy(smsSends.id)
  return rows.map((r) => r.id)
}

export async function resetFailedSmsBySlug(slug: string): Promise<number> {
  const rows = await getDb()
    .update(smsSends)
    .set({ sendError: null, nextAttemptAt: sql`NOW()` })
    .where(
      and(
        eq(smsSends.postSlug, slug),
        isNull(smsSends.sentAt),
        isNotNull(smsSends.sendError),
        ne(smsSends.sendError, SMS_SEND_SKIPPED_UNSUBSCRIBED)
      )
    )
    .returning({ id: smsSends.id })
  return rows.length
}
