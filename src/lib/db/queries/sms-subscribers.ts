import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { SMS_SEND_SKIPPED_UNSUBSCRIBED } from '@/lib/db/queries/sms-sends'
import type { NewsletterSlug } from '@/lib/db/queries/subscribers'
import { type SmsSubscriber, smsSends, smsSubscribers } from '@/lib/db/schema'

const newsletterColumns = {
  postcard: smsSubscribers.subscribedPostcard,
  contraption: smsSubscribers.subscribedContraption,
  workshop: smsSubscribers.subscribedWorkshop,
  tsundoku: smsSubscribers.subscribedTsundoku,
} as const

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
          true,
          true,
          true,
          true,
          ${input.source ?? null}
        )
        ON CONFLICT (phone_number) DO UPDATE SET
          confirmed_at = NOW(),
          subscribed_postcard = true,
          subscribed_contraption = true,
          subscribed_workshop = true,
          subscribed_tsundoku = true,
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
      subscribedPostcard: true,
      subscribedContraption: true,
      subscribedWorkshop: true,
      subscribedTsundoku: true,
      source: input.source ?? null,
    })
    .onConflictDoUpdate({
      target: smsSubscribers.phoneNumber,
      set: {
        confirmedAt: sql`NOW()`,
        subscribedPostcard: true,
        subscribedContraption: true,
        subscribedWorkshop: true,
        subscribedTsundoku: true,
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

export async function unsubscribeSmsNumber(
  phoneNumber: string,
  input: { processedPhoneWebhookEventId?: number | null } = {}
): Promise<SmsSubscriber | null> {
  const db = getDb()
  if (input.processedPhoneWebhookEventId) {
    await db.execute(sql`
      WITH unsubscribed AS (
        UPDATE sms_subscribers
        SET
          confirmed_at = NULL,
          subscribed_postcard = false,
          subscribed_contraption = false,
          subscribed_workshop = false,
          subscribed_tsundoku = false,
          updated_at = NOW()
        WHERE phone_number = ${phoneNumber}
        RETURNING id
      ),
      skipped_sends AS (
        UPDATE sms_sends
        SET
          send_error = ${SMS_SEND_SKIPPED_UNSUBSCRIBED},
          next_attempt_at = NULL
        WHERE sms_subscriber_id IN (SELECT id FROM unsubscribed)
          AND sent_at IS NULL
        RETURNING id
      )
      UPDATE phone_webhook_events
      SET processed_at = NOW()
      WHERE id = ${input.processedPhoneWebhookEventId}
    `)
    return findSmsSubscriberByPhoneNumber(phoneNumber)
  }

  const rows = await db
    .update(smsSubscribers)
    .set({
      confirmedAt: null,
      subscribedPostcard: false,
      subscribedContraption: false,
      subscribedWorkshop: false,
      subscribedTsundoku: false,
      updatedAt: sql`NOW()`,
    })
    .where(eq(smsSubscribers.phoneNumber, phoneNumber))
    .returning()
  const subscriber = rows[0] ?? null
  if (subscriber) {
    await db
      .update(smsSends)
      .set({
        sendError: SMS_SEND_SKIPPED_UNSUBSCRIBED,
        nextAttemptAt: null,
      })
      .where(
        and(
          eq(smsSends.smsSubscriberId, subscriber.id),
          isNull(smsSends.sentAt)
        )
      )
  }
  return subscriber
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
          eq(smsSubscribers.subscribedWorkshop, true),
          eq(smsSubscribers.subscribedTsundoku, true)
        )
      )
    )
  return rows[0]?.count ?? 0
}
