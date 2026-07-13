import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { type SmsSend, smsSends, smsSubscribers } from '@/lib/db/schema'
import { isNewsletterSendingEnabled } from '@/lib/newsletters'

const INSERT_CHUNK = 500
export const SMS_SEND_SKIPPED_UNSUBSCRIBED =
  'Skipped: unsubscribed before SMS send'

const newsletterColumns = {
  postcard: smsSubscribers.subscribedPostcard,
  contraption: smsSubscribers.subscribedContraption,
  workshop: smsSubscribers.subscribedWorkshop,
  tsundoku: smsSubscribers.subscribedTsundoku,
} as const

export async function bulkCreateQueuedSms(input: {
  smsSubscriberIds: number[]
  postSlug: string
  newsletter: string
  body: string
  mediaUrl?: string
}): Promise<number[]> {
  if (!isNewsletterSendingEnabled(input.newsletter)) return []
  const ids: number[] = []
  for (let i = 0; i < input.smsSubscriberIds.length; i += INSERT_CHUNK) {
    const chunk = input.smsSubscriberIds.slice(i, i + INSERT_CHUNK)
    const newsletterColumn =
      newsletterColumns[input.newsletter as keyof typeof newsletterColumns]
    if (!newsletterColumn) continue
    const result = await getDb().execute<{ id: number }>(sql`
      INSERT INTO ${smsSends}
        (sms_subscriber_id, post_slug, newsletter, body, media_url, next_attempt_at)
      SELECT
        ${smsSubscribers.id},
        ${input.postSlug},
        ${input.newsletter},
        ${input.body},
        ${input.mediaUrl ?? null},
        NOW()
      FROM ${smsSubscribers}
      WHERE ${and(
        inArray(smsSubscribers.id, chunk),
        isNotNull(smsSubscribers.confirmedAt),
        eq(newsletterColumn, true)
      )}
      ORDER BY ${smsSubscribers.id} DESC
      ON CONFLICT (sms_subscriber_id, post_slug) DO NOTHING
      RETURNING ${smsSends.id} AS id
    `)
    const rows = Array.isArray(result) ? result : result.rows
    ids.push(...rows.map((r) => r.id))
  }
  return ids
}

export type ClaimedSmsSend = { send: SmsSend; phoneNumber: string }

export async function claimSendableSmsById(
  id: number
): Promise<ClaimedSmsSend | null> {
  const rows = await getDb()
    .update(smsSends)
    .set({ nextAttemptAt: sql`NOW() + INTERVAL '10 minutes'` })
    .from(smsSubscribers)
    .where(
      and(
        eq(smsSends.id, id),
        eq(smsSends.smsSubscriberId, smsSubscribers.id),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError),
        isNotNull(smsSends.nextAttemptAt),
        lte(smsSends.nextAttemptAt, sql`NOW()`),
        isNotNull(smsSubscribers.confirmedAt)
      )
    )
    .returning({ send: smsSends, phoneNumber: smsSubscribers.phoneNumber })
  return rows[0] ?? null
}

export async function releaseSmsClaim(id: number): Promise<void> {
  await getDb()
    .update(smsSends)
    .set({ nextAttemptAt: sql`NOW()` })
    .where(
      and(
        eq(smsSends.id, id),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError),
        isNotNull(smsSends.nextAttemptAt)
      )
    )
}

export async function markUnsendableSmsSkippedById(
  id: number
): Promise<boolean> {
  const rows = await getDb()
    .update(smsSends)
    .set({
      sendError: SMS_SEND_SKIPPED_UNSUBSCRIBED,
      nextAttemptAt: null,
    })
    .from(smsSubscribers)
    .where(
      and(
        eq(smsSends.id, id),
        eq(smsSends.smsSubscriberId, smsSubscribers.id),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError),
        isNull(smsSubscribers.confirmedAt)
      )
    )
    .returning({ id: smsSends.id })
  return rows.length > 0
}

export async function pendingSmsReservationById(
  id: number
): Promise<Date | null> {
  const rows = await getDb()
    .select({ nextAttemptAt: smsSends.nextAttemptAt })
    .from(smsSends)
    .innerJoin(smsSubscribers, eq(smsSends.smsSubscriberId, smsSubscribers.id))
    .where(
      and(
        eq(smsSends.id, id),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError),
        isNotNull(smsSends.nextAttemptAt),
        gt(smsSends.nextAttemptAt, sql`NOW()`),
        isNotNull(smsSubscribers.confirmedAt)
      )
    )
  return rows[0]?.nextAttemptAt ?? null
}

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
        isNotNull(smsSends.nextAttemptAt),
        lte(smsSends.nextAttemptAt, sql`NOW()`),
        isNotNull(smsSubscribers.confirmedAt)
      )
    )
  return rows
}

export async function findSentSmsByIds(
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
        isNotNull(smsSends.sentAt),
        isNotNull(smsSends.twilioSid)
      )
    )
  return rows
}

export async function markSmsSent(input: {
  id: number
  twilioSid: string
  twilioStatus: string
}): Promise<boolean> {
  const rows = await getDb()
    .update(smsSends)
    .set({
      sentAt: sql`NOW()`,
      sendError: null,
      nextAttemptAt: null,
      twilioSid: input.twilioSid,
      twilioStatus: input.twilioStatus,
    })
    .where(
      and(
        eq(smsSends.id, input.id),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError)
      )
    )
    .returning({ id: smsSends.id })
  return rows.length > 0
}

export async function markSmsPermanentFailure(
  id: number,
  error: string
): Promise<boolean> {
  const rows = await getDb()
    .update(smsSends)
    .set({
      sendError: error,
      attempts: sql`${smsSends.attempts} + 1`,
      nextAttemptAt: null,
    })
    .where(
      and(
        eq(smsSends.id, id),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError)
      )
    )
    .returning({ id: smsSends.id })
  return rows.length > 0
}

export type SmsSendStats = {
  total: number
  sent: number
  pending: number
  failed: number
  skipped: number
}

export async function smsSendStatsBySlug(slug: string): Promise<SmsSendStats> {
  const rows = await getDb()
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`(count(*) FILTER (WHERE ${smsSends.sentAt} IS NOT NULL))::int`,
      failed: sql<number>`(count(*) FILTER (WHERE ${smsSends.sendError} IS NOT NULL AND ${smsSends.sendError} <> ${SMS_SEND_SKIPPED_UNSUBSCRIBED} AND ${smsSends.sentAt} IS NULL))::int`,
      skipped: sql<number>`(count(*) FILTER (WHERE ${smsSends.sendError} = ${SMS_SEND_SKIPPED_UNSUBSCRIBED} AND ${smsSends.sentAt} IS NULL))::int`,
      pending: sql<number>`(count(*) FILTER (WHERE ${smsSends.sentAt} IS NULL AND ${smsSends.sendError} IS NULL))::int`,
    })
    .from(smsSends)
    .where(eq(smsSends.postSlug, slug))
  return rows[0] ?? { total: 0, sent: 0, pending: 0, failed: 0, skipped: 0 }
}

export async function pendingSmsRowIdsBySlug(slug: string): Promise<number[]> {
  const rows = await getDb()
    .select({ id: smsSends.id })
    .from(smsSends)
    .where(
      and(
        eq(smsSends.postSlug, slug),
        isNull(smsSends.sentAt),
        isNull(smsSends.sendError),
        isNotNull(smsSends.nextAttemptAt),
        lte(smsSends.nextAttemptAt, sql`NOW()`)
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
