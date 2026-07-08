import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
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
}): Promise<SmsSubscriber> {
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
  phoneNumber: string
): Promise<SmsSubscriber | null> {
  const rows = await getDb()
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
  return rows[0] ?? null
}

function eligibilityWhere(newsletter: NewsletterSlug, postSlug: string) {
  return and(
    isNotNull(smsSubscribers.confirmedAt),
    eq(newsletterColumns[newsletter], true),
    sql`NOT EXISTS (
      SELECT 1 FROM ${smsSends}
      WHERE ${smsSends.smsSubscriberId} = ${smsSubscribers.id}
        AND ${smsSends.postSlug} = ${postSlug}
        AND (${smsSends.sentAt} IS NOT NULL OR ${smsSends.sendError} IS NULL)
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
