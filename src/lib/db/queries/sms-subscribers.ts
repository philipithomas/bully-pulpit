import { randomUUID } from 'node:crypto'
import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import { smsIdentityHash } from '@/lib/chat/bell-identity'
import { getDb } from '@/lib/db/client'
import { SMS_SEND_SKIPPED_UNSUBSCRIBED } from '@/lib/db/queries/sms-sends'
import type { NewsletterSlug } from '@/lib/db/queries/subscribers'
import {
  bellConversations,
  phoneWebhookEvents,
  type SmsSubscriber,
  smsSends,
  smsSubscribers,
  textMessages,
} from '@/lib/db/schema'
import {
  isNewsletterAcceptingSubscriptions,
  isNewsletterSendingEnabled,
} from '@/lib/newsletters'

const defaultSmsSubscriptions = {
  postcard: isNewsletterAcceptingSubscriptions('postcard'),
  contraption: isNewsletterAcceptingSubscriptions('contraption'),
  workshop: isNewsletterAcceptingSubscriptions('workshop'),
  tsundoku: isNewsletterAcceptingSubscriptions('tsundoku'),
}

const newsletterColumns = {
  postcard: smsSubscribers.subscribedPostcard,
  contraption: smsSubscribers.subscribedContraption,
  workshop: smsSubscribers.subscribedWorkshop,
  tsundoku: smsSubscribers.subscribedTsundoku,
} as const

const BELL_CONTACT_CARD_CLAIM_MS = 2 * 60 * 1000

export type BellContactCardClaim = {
  id: string
  processingAt: Date
}

export async function subscribeSmsNumber(input: {
  phoneNumber: string
  source?: string | null
  processedPhoneWebhookEventId?: number | null
}): Promise<SmsSubscriber> {
  if (input.processedPhoneWebhookEventId) {
    const db = getDb()
    await db.execute(sql`
      WITH upserted AS (
        INSERT INTO sms_subscribers
          (
            phone_number,
            confirmed_at,
            subscribed_postcard,
            subscribed_contraption,
            subscribed_workshop,
            subscribed_tsundoku,
            source
          )
        VALUES (
          ${input.phoneNumber},
          NOW(),
          ${defaultSmsSubscriptions.postcard},
          ${defaultSmsSubscriptions.contraption},
          ${defaultSmsSubscriptions.workshop},
          ${defaultSmsSubscriptions.tsundoku},
          ${input.source ?? null}
        )
        ON CONFLICT (phone_number) DO UPDATE SET
          confirmed_at = NOW(),
          subscribed_postcard = CASE
            WHEN ${defaultSmsSubscriptions.postcard} THEN true
            ELSE sms_subscribers.subscribed_postcard
          END,
          subscribed_contraption = CASE
            WHEN ${defaultSmsSubscriptions.contraption} THEN true
            ELSE sms_subscribers.subscribed_contraption
          END,
          subscribed_workshop = CASE
            WHEN ${defaultSmsSubscriptions.workshop} THEN true
            ELSE sms_subscribers.subscribed_workshop
          END,
          subscribed_tsundoku = CASE
            WHEN ${defaultSmsSubscriptions.tsundoku} THEN true
            ELSE sms_subscribers.subscribed_tsundoku
          END,
          source = COALESCE(sms_subscribers.source, excluded.source),
          updated_at = NOW()
        RETURNING id
      )
      UPDATE phone_webhook_events
      SET processed_at = NOW()
      WHERE id = ${input.processedPhoneWebhookEventId}
    `)
    const subscriber = await findSmsSubscriberByPhoneNumber(input.phoneNumber)
    if (!subscriber) {
      throw new Error(`SMS subscriber ${input.phoneNumber} was not saved`)
    }
    return subscriber
  }

  const rows = await getDb()
    .insert(smsSubscribers)
    .values({
      phoneNumber: input.phoneNumber,
      confirmedAt: sql`NOW()`,
      subscribedPostcard: defaultSmsSubscriptions.postcard,
      subscribedContraption: defaultSmsSubscriptions.contraption,
      subscribedWorkshop: defaultSmsSubscriptions.workshop,
      subscribedTsundoku: defaultSmsSubscriptions.tsundoku,
      source: input.source ?? null,
    })
    .onConflictDoUpdate({
      target: smsSubscribers.phoneNumber,
      set: {
        confirmedAt: sql`NOW()`,
        subscribedPostcard: sql`CASE
          WHEN ${defaultSmsSubscriptions.postcard} THEN true
          ELSE ${smsSubscribers.subscribedPostcard}
        END`,
        subscribedContraption: sql`CASE
          WHEN ${defaultSmsSubscriptions.contraption} THEN true
          ELSE ${smsSubscribers.subscribedContraption}
        END`,
        subscribedWorkshop: sql`CASE
          WHEN ${defaultSmsSubscriptions.workshop} THEN true
          ELSE ${smsSubscribers.subscribedWorkshop}
        END`,
        subscribedTsundoku: sql`CASE
          WHEN ${defaultSmsSubscriptions.tsundoku} THEN true
          ELSE ${smsSubscribers.subscribedTsundoku}
        END`,
        source: sql`COALESCE(${smsSubscribers.source}, excluded.source)`,
        updatedAt: sql`NOW()`,
      },
    })
    .returning()
  return rows[0]
}

export async function findSmsSubscriberByPhoneNumber(
  phoneNumber: string
): Promise<SmsSubscriber | null> {
  const rows = await getDb()
    .select()
    .from(smsSubscribers)
    .where(eq(smsSubscribers.phoneNumber, phoneNumber))
    .limit(1)
  return rows[0] ?? null
}

export async function findSmsSubscriberById(
  id: number
): Promise<SmsSubscriber | null> {
  const rows = await getDb()
    .select()
    .from(smsSubscribers)
    .where(eq(smsSubscribers.id, id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Atomically claims the Bell contact-card send for one active subscription.
 * A stale lease can be reclaimed after a crashed invocation.
 */
export async function claimBellContactCard(
  phoneNumber: string
): Promise<BellContactCardClaim | null> {
  const staleBefore = new Date(Date.now() - BELL_CONTACT_CARD_CLAIM_MS)
  const claim = { id: randomUUID(), processingAt: new Date() }
  const rows = await getDb()
    .update(smsSubscribers)
    .set({
      bellContactCardClaimId: claim.id,
      bellContactCardProcessingAt: claim.processingAt,
    })
    .where(
      and(
        eq(smsSubscribers.phoneNumber, phoneNumber),
        isNotNull(smsSubscribers.confirmedAt),
        isNull(smsSubscribers.bellContactCardSentAt),
        or(
          isNull(smsSubscribers.bellContactCardProcessingAt),
          lt(smsSubscribers.bellContactCardProcessingAt, staleBefore)
        )
      )
    )
    .returning({ id: smsSubscribers.id })
  return rows.length > 0 ? claim : null
}

/** Revalidates ownership immediately before the provider request. */
export async function refreshBellContactCardClaim(
  phoneNumber: string,
  claim: BellContactCardClaim
): Promise<boolean> {
  const rows = await getDb()
    .update(smsSubscribers)
    .set({ bellContactCardProcessingAt: new Date() })
    .where(
      and(
        eq(smsSubscribers.phoneNumber, phoneNumber),
        eq(smsSubscribers.bellContactCardClaimId, claim.id),
        isNotNull(smsSubscribers.confirmedAt),
        isNull(smsSubscribers.bellContactCardSentAt)
      )
    )
    .returning({ id: smsSubscribers.id })
  return rows.length > 0
}

/**
 * Records provider acceptance and completes the claim in one SQL statement.
 * A constraint or database failure rolls both changes back together.
 */
export async function completeBellContactCard(input: {
  phoneNumber: string
  claim: BellContactCardClaim
  attemptId: number
  twilioSid: string
  status: string
}): Promise<void> {
  await getDb().execute(sql`
    WITH completed AS (
      UPDATE sms_subscribers
      SET
        bell_contact_card_claim_id = NULL,
        bell_contact_card_processing_at = NULL,
        bell_contact_card_sent_at = NOW()
      WHERE phone_number = ${input.phoneNumber}
        AND bell_contact_card_claim_id = ${input.claim.id}
        AND confirmed_at IS NOT NULL
        AND bell_contact_card_sent_at IS NULL
      RETURNING id
    )
    UPDATE text_messages
    SET
      twilio_sid = ${input.twilioSid},
      status = ${input.status}
    WHERE id = ${input.attemptId}
  `)
}

/** Releases a claim and records its attempt outcome atomically. */
export async function failBellContactCard(input: {
  phoneNumber: string
  claim: BellContactCardClaim
  attemptId: number
  status?: 'cancelled' | 'failed'
}): Promise<void> {
  await getDb().execute(sql`
    WITH released AS (
      UPDATE sms_subscribers
      SET
        bell_contact_card_claim_id = NULL,
        bell_contact_card_processing_at = NULL
      WHERE phone_number = ${input.phoneNumber}
        AND bell_contact_card_claim_id = ${input.claim.id}
        AND bell_contact_card_sent_at IS NULL
      RETURNING id
    )
    UPDATE text_messages
    SET status = ${input.status ?? 'failed'}
    WHERE id = ${input.attemptId}
  `)
}

/** Releases a claim when no provider attempt was recorded. */
export async function releaseBellContactCard(
  phoneNumber: string,
  claim: BellContactCardClaim
): Promise<void> {
  await getDb()
    .update(smsSubscribers)
    .set({
      bellContactCardClaimId: null,
      bellContactCardProcessingAt: null,
    })
    .where(
      and(
        eq(smsSubscribers.phoneNumber, phoneNumber),
        eq(smsSubscribers.bellContactCardClaimId, claim.id),
        isNull(smsSubscribers.bellContactCardSentAt)
      )
    )
}

/**
 * Deletes every locally stored row tied to a phone number. The webhook event
 * remains as a phone-free MessageSid dedupe marker so Twilio retries cannot
 * repeat the STOP side effect.
 */
export async function deleteSmsDataForPhoneNumber(
  phoneNumber: string,
  input: { processedPhoneWebhookEventId?: number | null } = {}
): Promise<void> {
  const smsPhoneHash = smsIdentityHash(phoneNumber)
  await getDb().execute(sql`
    WITH target_subscriber AS (
      SELECT ${smsSubscribers.id} AS id
      FROM ${smsSubscribers}
      WHERE ${smsSubscribers.phoneNumber} = ${phoneNumber}
    ), deleted_bell_conversations AS (
      DELETE FROM ${bellConversations}
      WHERE ${bellConversations.smsPhoneHash} = ${smsPhoneHash}
        OR ${bellConversations.smsSubscriberId} IN (
          SELECT id FROM target_subscriber
        )
      RETURNING ${bellConversations.id}
    ), deleted_text_messages AS (
      DELETE FROM ${textMessages}
      WHERE ${textMessages.fromNumber} = ${phoneNumber}
        OR ${textMessages.toNumber} = ${phoneNumber}
      RETURNING ${textMessages.id}
    ), deleted_subscriber AS (
      DELETE FROM ${smsSubscribers}
      WHERE ${smsSubscribers.id} IN (SELECT id FROM target_subscriber)
      RETURNING ${smsSubscribers.id}
    ), processed_webhook AS (
      UPDATE ${phoneWebhookEvents}
      SET processed_at = NOW()
      WHERE ${phoneWebhookEvents.id} = ${input.processedPhoneWebhookEventId ?? null}
      RETURNING ${phoneWebhookEvents.id}
    )
    SELECT
      (SELECT COUNT(*) FROM deleted_bell_conversations) AS bell_conversations,
      (SELECT COUNT(*) FROM deleted_text_messages) AS text_messages,
      (SELECT COUNT(*) FROM deleted_subscriber) AS subscribers,
      (SELECT COUNT(*) FROM processed_webhook) AS webhook_events
  `)
}

function eligibilityWhere(newsletter: NewsletterSlug, postSlug: string) {
  return and(
    isNotNull(smsSubscribers.confirmedAt),
    eq(newsletterColumns[newsletter], true),
    sql`NOT EXISTS (
      SELECT 1 FROM ${smsSends}
      WHERE ${smsSends.smsSubscriberId} = ${smsSubscribers.id}
        AND ${smsSends.postSlug} = ${postSlug}
        AND (
          ${smsSends.sentAt} IS NOT NULL
          OR ${smsSends.sendError} IS NULL
          OR ${smsSends.sendError} = ${SMS_SEND_SKIPPED_UNSUBSCRIBED}
        )
    )`
  )
}

export async function findEligibleSmsIds(
  newsletter: NewsletterSlug,
  postSlug: string
): Promise<number[]> {
  if (!isNewsletterSendingEnabled(newsletter)) return []
  const rows = await getDb()
    .select({ id: smsSubscribers.id })
    .from(smsSubscribers)
    .where(eligibilityWhere(newsletter, postSlug))
    .orderBy(desc(smsSubscribers.createdAt), desc(smsSubscribers.id))
  return rows.map((r) => r.id)
}

export async function countEligibleSms(
  newsletter: NewsletterSlug,
  postSlug: string
): Promise<number> {
  if (!isNewsletterSendingEnabled(newsletter)) return 0
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(smsSubscribers)
    .where(eligibilityWhere(newsletter, postSlug))
  return rows[0]?.count ?? 0
}

export async function countActiveSms(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(smsSubscribers)
    .where(
      and(
        isNotNull(smsSubscribers.confirmedAt),
        or(
          eq(smsSubscribers.subscribedPostcard, true),
          eq(smsSubscribers.subscribedContraption, true),
          eq(smsSubscribers.subscribedWorkshop, true)
        )
      )
    )
  return rows[0]?.count ?? 0
}

export type SmsSubscriberListItem = {
  id: number
  phoneNumber: string
  confirmedAt: string | null
  subscribedPostcard: boolean
  subscribedContraption: boolean
  subscribedWorkshop: boolean
  subscribedTsundoku: boolean
  source: string | null
  createdAt: string
}

/** Paginated SMS subscriber list for the Printing press admin. */
export async function listSmsSubscribers(opts: {
  search?: string
  newsletter?: NewsletterSlug
  limit?: number
  offset?: number
}): Promise<{ rows: SmsSubscriberListItem[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)
  const search = opts.search?.trim()
  const filters: SQL[] = []
  if (search) {
    filters.push(sql`${smsSubscribers.phoneNumber} LIKE ${`%${search}%`}`)
  }
  if (opts.newsletter) {
    filters.push(eq(newsletterColumns[opts.newsletter], true))
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  const countRows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(smsSubscribers)
    .where(where)
  const total = countRows[0]?.n ?? 0

  const rows = await getDb()
    .select()
    .from(smsSubscribers)
    .where(where)
    .orderBy(desc(smsSubscribers.createdAt), desc(smsSubscribers.id))
    .limit(limit)
    .offset(offset)

  return {
    rows: rows.map((subscriber) => ({
      id: subscriber.id,
      phoneNumber: subscriber.phoneNumber,
      confirmedAt: subscriber.confirmedAt
        ? subscriber.confirmedAt.toISOString()
        : null,
      subscribedPostcard: subscriber.subscribedPostcard,
      subscribedContraption: subscriber.subscribedContraption,
      subscribedWorkshop: subscriber.subscribedWorkshop,
      subscribedTsundoku: subscriber.subscribedTsundoku,
      source: subscriber.source,
      createdAt: subscriber.createdAt.toISOString(),
    })),
    total,
  }
}

/**
 * Hard-deletes an active SMS subscriber and its newsletter-send rows
 * atomically. Inactive rows are STOP tombstones and must survive until the
 * handset reactivates them. Phone transcripts and Bell conversations have
 * separate admin lifecycles.
 */
export async function deleteSmsSubscriberWithData(
  id: number
): Promise<boolean> {
  const result = await getDb().execute<{ id: number }>(sql`
    WITH target AS MATERIALIZED (
      SELECT ${smsSubscribers.id}
      FROM ${smsSubscribers}
      WHERE ${smsSubscribers.id} = ${id}
        AND ${smsSubscribers.confirmedAt} IS NOT NULL
      FOR UPDATE
    ),
    deleted_sends AS (
      DELETE FROM ${smsSends}
      WHERE ${smsSends.smsSubscriberId} IN (SELECT id FROM target)
      RETURNING ${smsSends.id}
    )
    DELETE FROM ${smsSubscribers}
    WHERE ${smsSubscribers.id} IN (SELECT id FROM target)
      -- Force child cleanup to finish before the parent delete. Locking the
      -- target first serializes this path with STOP and newsletter enqueue.
      AND (SELECT count(*) FROM deleted_sends) >= 0
    RETURNING ${smsSubscribers.id} AS id
  `)
  const rows = Array.isArray(result) ? result : result.rows
  return rows.length > 0
}
