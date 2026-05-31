import { and, eq, isNotNull, or, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import {
  emailSends,
  logins,
  type Subscriber,
  subscribers,
} from '@/lib/db/schema'

const newsletterColumns = {
  postcard: subscribers.subscribedPostcard,
  contraption: subscribers.subscribedContraption,
  workshop: subscribers.subscribedWorkshop,
} as const

export type NewsletterSlug = keyof typeof newsletterColumns

export function isNewsletter(value: string): value is NewsletterSlug {
  return value in newsletterColumns
}

export async function findById(id: number): Promise<Subscriber | null> {
  const rows = await getDb()
    .select()
    .from(subscribers)
    .where(eq(subscribers.id, id))
    .limit(1)
  return rows[0] ?? null
}

export async function findByEmail(email: string): Promise<Subscriber | null> {
  const rows = await getDb()
    .select()
    .from(subscribers)
    .where(eq(subscribers.email, email.toLowerCase()))
    .limit(1)
  return rows[0] ?? null
}

export async function findByUuid(uuid: string): Promise<Subscriber | null> {
  const rows = await getDb()
    .select()
    .from(subscribers)
    .where(eq(subscribers.uuid, uuid))
    .limit(1)
  return rows[0] ?? null
}

export async function createSubscriber(input: {
  email: string
  name?: string | null
  source?: string | null
}): Promise<Subscriber> {
  const rows = await getDb()
    .insert(subscribers)
    .values({
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      source: input.source ?? null,
    })
    .returning()
  return rows[0]
}

export async function confirmSubscriber(id: number): Promise<Subscriber> {
  const rows = await getDb()
    .update(subscribers)
    .set({ confirmedAt: sql`NOW()`, updatedAt: sql`NOW()` })
    .where(eq(subscribers.id, id))
    .returning()
  return rows[0]
}

export type SubscriberPrefs = {
  name?: string | null
  subscribedPostcard?: boolean
  subscribedContraption?: boolean
  subscribedWorkshop?: boolean
}

/**
 * Partial update mirroring printing-press's COALESCE semantics: only the
 * provided fields change; omitted fields keep their current value.
 */
export async function updateSubscriber(
  uuid: string,
  prefs: SubscriberPrefs
): Promise<Subscriber | null> {
  const rows = await getDb()
    .update(subscribers)
    .set({
      ...(prefs.name !== undefined ? { name: prefs.name } : {}),
      ...(prefs.subscribedPostcard !== undefined
        ? { subscribedPostcard: prefs.subscribedPostcard }
        : {}),
      ...(prefs.subscribedContraption !== undefined
        ? { subscribedContraption: prefs.subscribedContraption }
        : {}),
      ...(prefs.subscribedWorkshop !== undefined
        ? { subscribedWorkshop: prefs.subscribedWorkshop }
        : {}),
      updatedAt: sql`NOW()`,
    })
    .where(eq(subscribers.uuid, uuid))
    .returning()
  return rows[0] ?? null
}

export async function countActive(): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(
      and(
        isNotNull(subscribers.confirmedAt),
        or(
          eq(subscribers.subscribedPostcard, true),
          eq(subscribers.subscribedContraption, true),
          eq(subscribers.subscribedWorkshop, true)
        )
      )
    )
  return rows[0]?.count ?? 0
}

/**
 * Subscribers eligible to receive `postSlug` for `newsletter`: confirmed, opted
 * into that newsletter, and not already successfully sent or currently pending.
 * Diverges from printing-press: rows with `send_error` (and no `sent_at`) do NOT
 * block a re-send, so transient/SES-sandbox failures self-heal on retry.
 */
function eligibilityWhere(newsletter: NewsletterSlug, postSlug: string) {
  return and(
    isNotNull(subscribers.confirmedAt),
    eq(newsletterColumns[newsletter], true),
    sql`NOT EXISTS (
      SELECT 1 FROM ${emailSends}
      WHERE ${emailSends.subscriberId} = ${subscribers.id}
        AND ${emailSends.postSlug} = ${postSlug}
        AND (${emailSends.sentAt} IS NOT NULL OR ${emailSends.sendError} IS NULL)
    )`
  )
}

export async function findEligibleIds(
  newsletter: NewsletterSlug,
  postSlug: string
): Promise<number[]> {
  const rows = await getDb()
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(eligibilityWhere(newsletter, postSlug))
  return rows.map((r) => r.id)
}

export async function countEligible(
  newsletter: NewsletterSlug,
  postSlug: string
): Promise<number> {
  const rows = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eligibilityWhere(newsletter, postSlug))
  return rows[0]?.count ?? 0
}

/**
 * Deletes a subscriber and all dependent rows atomically. Uses a single CTE
 * statement because the Neon HTTP driver does not support interactive
 * transactions; children are removed before the parent (no ON DELETE CASCADE).
 */
export async function deleteWithData(id: number): Promise<void> {
  await getDb().execute(sql`
    WITH deleted_logins AS (
      DELETE FROM ${logins} WHERE ${logins.subscriberId} = ${id}
    ),
    deleted_sends AS (
      DELETE FROM ${emailSends} WHERE ${emailSends.subscriberId} = ${id}
    )
    DELETE FROM ${subscribers} WHERE ${subscribers.id} = ${id}
  `)
}

export type SerializedSubscriber = {
  uuid: string
  email: string
  name: string | null
  confirmed_at: string | null
  subscribed_postcard: boolean
  subscribed_contraption: boolean
  subscribed_workshop: boolean
  source: string | null
  created_at: string
  updated_at: string
}

/** Serializes a subscriber to the snake_case JSON shape the frontend expects. */
export function serializeSubscriber(s: Subscriber): SerializedSubscriber {
  return {
    uuid: s.uuid,
    email: s.email,
    name: s.name,
    confirmed_at: s.confirmedAt ? s.confirmedAt.toISOString() : null,
    subscribed_postcard: s.subscribedPostcard,
    subscribed_contraption: s.subscribedContraption,
    subscribed_workshop: s.subscribedWorkshop,
    source: s.source,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  }
}

/** Maps a snake_case request body to the camelCase prefs accepted by updateSubscriber. */
export function prefsFromBody(body: Record<string, unknown>): SubscriberPrefs {
  const prefs: SubscriberPrefs = {}
  if (typeof body.name === 'string') prefs.name = body.name
  if (typeof body.subscribed_postcard === 'boolean')
    prefs.subscribedPostcard = body.subscribed_postcard
  if (typeof body.subscribed_contraption === 'boolean')
    prefs.subscribedContraption = body.subscribed_contraption
  if (typeof body.subscribed_workshop === 'boolean')
    prefs.subscribedWorkshop = body.subscribed_workshop
  return prefs
}

/** Masks a local part for display, identical to printing-press's mask_email. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at === -1) return '***'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length <= 1) return `*@${domain}`
  return `${local[0]}${'*'.repeat(local.length - 1)}@${domain}`
}
