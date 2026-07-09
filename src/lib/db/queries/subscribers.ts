import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm'
import type { SubscriberPreferences } from '@/lib/auth/preferences'
import { getDb } from '@/lib/db/client'
import {
  emailSends,
  emailSuppressions,
  logins,
  type Subscriber,
  smsSubscribers,
  subscribers,
} from '@/lib/db/schema'
import {
  isNewsletterAcceptingSubscriptions,
  isNewsletterSendingEnabled,
} from '@/lib/newsletters'

const newsletterColumns = {
  postcard: subscribers.subscribedPostcard,
  contraption: subscribers.subscribedContraption,
  workshop: subscribers.subscribedWorkshop,
  tsundoku: subscribers.subscribedTsundoku,
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

/**
 * Invalidates sessions only when the presented token still has the current
 * version. A stale token must not advance the counter and revoke newer logins.
 */
export async function revokeSubscriberSessions(
  uuid: string,
  expectedVersion: number
): Promise<boolean> {
  const rows = await getDb()
    .update(subscribers)
    .set({
      sessionVersion: sql`${subscribers.sessionVersion} + 1`,
      updatedAt: sql`NOW()`,
    })
    .where(
      and(
        eq(subscribers.uuid, uuid),
        eq(subscribers.sessionVersion, expectedVersion)
      )
    )
    .returning({ uuid: subscribers.uuid })
  return rows.length > 0
}

export async function createSubscriber(input: {
  email: string
  name?: string | null
  source?: string | null
  subscribedPostcard?: boolean
  subscribedContraption?: boolean
  subscribedWorkshop?: boolean
  subscribedTsundoku?: boolean
}): Promise<Subscriber> {
  const rows = await getDb()
    .insert(subscribers)
    .values({
      email: input.email.toLowerCase(),
      name: input.name ?? null,
      source: input.source ?? null,
      // Omitted flags fall back to the column defaults. Standing newsletters
      // default on; Tsundoku stays off unless the service layer opts in.
      ...(input.subscribedPostcard !== undefined
        ? { subscribedPostcard: input.subscribedPostcard }
        : {}),
      ...(input.subscribedContraption !== undefined
        ? { subscribedContraption: input.subscribedContraption }
        : {}),
      ...(input.subscribedWorkshop !== undefined
        ? { subscribedWorkshop: input.subscribedWorkshop }
        : {}),
      ...(input.subscribedTsundoku !== undefined
        ? { subscribedTsundoku: input.subscribedTsundoku }
        : {}),
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
  subscribedTsundoku?: boolean
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
      ...(prefs.subscribedTsundoku !== undefined
        ? { subscribedTsundoku: prefs.subscribedTsundoku }
        : {}),
      updatedAt: sql`NOW()`,
    })
    .where(eq(subscribers.uuid, uuid))
    .returning()
  return rows[0] ?? null
}

export async function countActive(): Promise<number> {
  const db = getDb()
  const emailRows = await db
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
  const smsRows = await db
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
  return (emailRows[0]?.count ?? 0) + (smsRows[0]?.count ?? 0)
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
  if (!isNewsletterSendingEnabled(newsletter)) return []
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
  if (!isNewsletterSendingEnabled(newsletter)) return 0
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

export function serializeSubscriberPreferences(
  s: Subscriber
): SubscriberPreferences {
  return {
    email: s.email,
    subscribed_contraption: s.subscribedContraption,
    subscribed_workshop: s.subscribedWorkshop,
    subscribed_postcard: s.subscribedPostcard,
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

export type SubscriberStats = {
  total: number
  confirmed: number
  postcard: number
  contraption: number
  workshop: number
  tsundoku: number
}

/** Aggregate counts for the Printing Press overview (one query). */
export async function subscriberStats(): Promise<SubscriberStats> {
  const confirmed = sql`${subscribers.confirmedAt} IS NOT NULL`
  const active = sql`(
    ${subscribers.subscribedPostcard}
    OR ${subscribers.subscribedContraption}
    OR ${subscribers.subscribedWorkshop}
  )`
  const rows = await getDb()
    .select({
      total: sql<number>`(count(*) FILTER (WHERE ${active}))::int`,
      confirmed: sql<number>`(count(*) FILTER (WHERE ${confirmed} AND ${active}))::int`,
      postcard: sql<number>`(count(*) FILTER (WHERE ${confirmed} AND ${subscribers.subscribedPostcard}))::int`,
      contraption: sql<number>`(count(*) FILTER (WHERE ${confirmed} AND ${subscribers.subscribedContraption}))::int`,
      workshop: sql<number>`(count(*) FILTER (WHERE ${confirmed} AND ${subscribers.subscribedWorkshop}))::int`,
      tsundoku: sql<number>`(count(*) FILTER (WHERE ${confirmed} AND ${subscribers.subscribedTsundoku}))::int`,
    })
    .from(subscribers)
  return (
    rows[0] ?? {
      total: 0,
      confirmed: 0,
      postcard: 0,
      contraption: 0,
      workshop: 0,
      tsundoku: 0,
    }
  )
}

export type SubscriberListItem = {
  uuid: string
  email: string
  name: string | null
  confirmedAt: string | null
  subscribedPostcard: boolean
  subscribedContraption: boolean
  subscribedWorkshop: boolean
  subscribedTsundoku: boolean
  /** Where the signup came from (external referrer origin, or a placeholder like csv_import). */
  source: string | null
  createdAt: string
  /** When the address was suppressed (bounce/complaint), null if deliverable. */
  suppressedAt: string | null
  suppressionReason: string | null
}

/**
 * Paginated subscriber list for the admin UI, optionally filtered by an email
 * substring. The search value is bound as a parameter (no SQL injection); `%`/`_`
 * in it act as LIKE wildcards, which is harmless for an admin search box.
 * Each row carries its email_suppressions match (both sides store lowercased
 * emails, and the suppression email is unique, so the join cannot fan out).
 */
export async function listSubscribers(opts: {
  search?: string
  newsletter?: NewsletterSlug
  limit?: number
  offset?: number
}): Promise<{ rows: SubscriberListItem[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100)
  const offset = Math.max(opts.offset ?? 0, 0)
  const search = opts.search?.trim().toLowerCase()
  const filters: SQL[] = []
  if (search) {
    filters.push(sql`lower(${subscribers.email}) LIKE ${`%${search}%`}`)
  }
  if (opts.newsletter) {
    filters.push(eq(newsletterColumns[opts.newsletter], true))
  }
  const where = filters.length > 0 ? and(...filters) : undefined

  const countRows = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(where)
  const total = countRows[0]?.n ?? 0

  // id breaks created_at ties (CSV imports share one NOW()) so offset paging
  // is stable — without it, pages can skip or duplicate rows.
  const rows = await getDb()
    .select({
      subscriber: subscribers,
      suppressedAt: emailSuppressions.createdAt,
      suppressionReason: emailSuppressions.reason,
    })
    .from(subscribers)
    .leftJoin(emailSuppressions, eq(emailSuppressions.email, subscribers.email))
    .where(where)
    .orderBy(desc(subscribers.createdAt), desc(subscribers.id))
    .limit(limit)
    .offset(offset)

  return {
    rows: rows.map(({ subscriber: s, suppressedAt, suppressionReason }) => ({
      uuid: s.uuid,
      email: s.email,
      name: s.name,
      confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString() : null,
      subscribedPostcard: s.subscribedPostcard,
      subscribedContraption: s.subscribedContraption,
      subscribedWorkshop: s.subscribedWorkshop,
      subscribedTsundoku: s.subscribedTsundoku,
      source: s.source,
      createdAt: s.createdAt.toISOString(),
      suppressedAt: suppressedAt ? suppressedAt.toISOString() : null,
      suppressionReason: suppressionReason ?? null,
    })),
    total,
  }
}

export type ExportRow = {
  email: string
  name: string | null
  postcard: boolean
  contraption: boolean
  workshop: boolean
  tsundoku: boolean
  confirmed: boolean
  source: string | null
  createdAt: string
}

/** Every subscriber, newest first, for CSV export. */
export async function allSubscribersForExport(): Promise<ExportRow[]> {
  const rows = await getDb()
    .select()
    .from(subscribers)
    .orderBy(desc(subscribers.createdAt), desc(subscribers.id))
  return rows.map((s) => ({
    email: s.email,
    name: s.name,
    postcard: s.subscribedPostcard,
    contraption: s.subscribedContraption,
    workshop: s.subscribedWorkshop,
    tsundoku: s.subscribedTsundoku,
    confirmed: s.confirmedAt != null,
    source: s.source,
    createdAt: s.createdAt.toISOString(),
  }))
}

export type ImportRow = {
  email: string
  name: string | null
  postcard: boolean
  contraption: boolean
  workshop: boolean
  tsundoku: boolean
  confirmed: boolean
  source: string | null
}

const IMPORT_CHUNK = 500

function importedNewsletterPreference(
  newsletter: NewsletterSlug,
  requested: boolean,
  columnPresent: boolean
): boolean {
  return (
    isNewsletterAcceptingSubscriptions(newsletter) &&
    (!columnPresent || requested)
  )
}

function inactiveNewsletterImportUpdate(
  existingPreference: SQLWrapper,
  requestedOptInEmails: string[]
): boolean | SQL {
  if (requestedOptInEmails.length === 0) return false
  return sql`CASE
    WHEN ${inArray(subscribers.email, requestedOptInEmails)}
      THEN ${existingPreference}
    ELSE false
  END`
}

/** Which optional columns the CSV actually contained (see importSubscribers). */
export type ImportColumnsPresent = {
  postcard: boolean
  contraption: boolean
  workshop: boolean
  tsundoku: boolean
  confirmed: boolean
}

/**
 * Upserts subscribers from a CSV import, keyed by email. A flag column the CSV
 * actually contains overwrites existing rows for active newsletters. For an
 * inactive newsletter, true preserves the existing value without activating a
 * new or opted-out row, while false may opt out. A column absent from the CSV
 * only sets defaults on NEW rows and leaves existing rows untouched — so a bare
 * email list can't re-subscribe someone who opted out. A name is only
 * overwritten when the import provides one; confirmation is monotonic — an
 * import can confirm a subscriber but never un-confirm one. Source is
 * backfill-only: new rows take the CSV source (falling back to 'csv_import');
 * existing rows take it only when the stored source is NULL or 'csv_import',
 * so a re-sync can restore attribution but never overwrite a real captured
 * referrer. Returns how many rows were created vs updated. Callers must dedupe
 * by email first (a single INSERT … ON CONFLICT can't touch the same row
 * twice).
 */
export async function importSubscribers(
  rows: ImportRow[],
  present: ImportColumnsPresent
): Promise<{ created: number; updated: number }> {
  let created = 0
  let updated = 0
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const chunk = rows.slice(i, i + IMPORT_CHUNK)
    const requestedOptInEmails = (newsletter: NewsletterSlug) =>
      chunk
        .filter((row) => row[newsletter])
        .map((row) => row.email.toLowerCase())
    const result = await getDb()
      .insert(subscribers)
      .values(
        chunk.map((r) => ({
          email: r.email.toLowerCase(),
          name: r.name,
          subscribedPostcard: importedNewsletterPreference(
            'postcard',
            r.postcard,
            present.postcard
          ),
          subscribedContraption: importedNewsletterPreference(
            'contraption',
            r.contraption,
            present.contraption
          ),
          subscribedWorkshop: importedNewsletterPreference(
            'workshop',
            r.workshop,
            present.workshop
          ),
          subscribedTsundoku: importedNewsletterPreference(
            'tsundoku',
            r.tsundoku,
            present.tsundoku
          ),
          confirmedAt: r.confirmed ? new Date() : null,
          source: r.source ?? 'csv_import',
        }))
      )
      .onConflictDoUpdate({
        target: subscribers.email,
        set: {
          name: sql`COALESCE(excluded.name, ${subscribers.name})`,
          // A key omitted from ON CONFLICT SET leaves the existing value alone.
          ...(present.postcard
            ? {
                subscribedPostcard: isNewsletterAcceptingSubscriptions(
                  'postcard'
                )
                  ? sql`excluded.subscribed_postcard`
                  : inactiveNewsletterImportUpdate(
                      subscribers.subscribedPostcard,
                      requestedOptInEmails('postcard')
                    ),
              }
            : {}),
          ...(present.contraption
            ? {
                subscribedContraption: isNewsletterAcceptingSubscriptions(
                  'contraption'
                )
                  ? sql`excluded.subscribed_contraption`
                  : inactiveNewsletterImportUpdate(
                      subscribers.subscribedContraption,
                      requestedOptInEmails('contraption')
                    ),
              }
            : {}),
          ...(present.workshop
            ? {
                subscribedWorkshop: isNewsletterAcceptingSubscriptions(
                  'workshop'
                )
                  ? sql`excluded.subscribed_workshop`
                  : inactiveNewsletterImportUpdate(
                      subscribers.subscribedWorkshop,
                      requestedOptInEmails('workshop')
                    ),
              }
            : {}),
          ...(present.tsundoku
            ? {
                subscribedTsundoku: isNewsletterAcceptingSubscriptions(
                  'tsundoku'
                )
                  ? sql`excluded.subscribed_tsundoku`
                  : inactiveNewsletterImportUpdate(
                      subscribers.subscribedTsundoku,
                      requestedOptInEmails('tsundoku')
                    ),
              }
            : {}),
          ...(present.confirmed
            ? {
                confirmedAt: sql`COALESCE(${subscribers.confirmedAt}, excluded.confirmed_at)`,
              }
            : {}),
          // Backfill attribution only where the stored value carries no
          // information (NULL or the 'csv_import' placeholder). NULLIF treats
          // the 'csv_import' fallback the insert stamps on source-less rows as
          // "no source in this CSV", so a bare email list leaves existing
          // sources untouched and a real captured referrer is never replaced.
          source: sql`CASE
            WHEN ${subscribers.source} IS NULL OR ${subscribers.source} = 'csv_import'
              THEN COALESCE(NULLIF(excluded.source, 'csv_import'), ${subscribers.source})
            ELSE ${subscribers.source}
          END`,
          updatedAt: sql`NOW()`,
        },
      })
      // xmax = 0 ⇒ the row was inserted; nonzero ⇒ it was an update.
      .returning({ inserted: sql<number>`(xmax = 0)::int` })
    for (const row of result) {
      if (row.inserted === 1) created += 1
      else updated += 1
    }
  }
  return { created, updated }
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
