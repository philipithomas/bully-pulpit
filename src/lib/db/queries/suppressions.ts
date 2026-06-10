import { and, eq, notInArray, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { emailSuppressions } from '@/lib/db/schema'

/** Source recorded by the real-time SES webhook (app/api/webhooks/ses). */
export const SES_WEBHOOK_SOURCE = 'ses-webhook'

/** Source recorded by the hourly reconciliation cron (app/api/cron/suppression-sync). */
const SES_SYNC_SOURCE = 'ses_suppression_list'

export async function isSuppressed(email: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, email.toLowerCase()))
    .limit(1)
  return rows.length > 0
}

export async function upsertSuppression(
  email: string,
  reason: string,
  source?: string | null
): Promise<void> {
  await getDb()
    .insert(emailSuppressions)
    .values({ email: email.toLowerCase(), reason, source: source ?? null })
    .onConflictDoUpdate({
      target: emailSuppressions.email,
      set: {
        // The hourly reconciliation sync only knows SES's terse reason enum
        // ('BOUNCE'), so it must not overwrite the rich reason the webhook
        // captured in real time ('Permanent bounce (General): …'). It does
        // take over `source`, which keeps the SES account-level list
        // authoritative for cleanup via deleteBySourceNotIn: removing an
        // address from the SES console still clears the row within the hour.
        reason: sql`CASE WHEN excluded.source = ${SES_SYNC_SOURCE} THEN ${emailSuppressions.reason} ELSE excluded.reason END`,
        source: sql`excluded.source`,
      },
    })
}

/**
 * Deletes rows from the given source whose email is absent from `emails`,
 * making a sync authoritative for that source. An empty `emails` list deletes
 * every row for the source — callers must only pass an empty list when the
 * upstream fetch genuinely returned zero entries. Returns the deleted count.
 */
export async function deleteBySourceNotIn(
  source: string,
  emails: string[]
): Promise<number> {
  const keep = emails.map((e) => e.toLowerCase())
  const deleted = await getDb()
    .delete(emailSuppressions)
    .where(
      keep.length > 0
        ? and(
            eq(emailSuppressions.source, source),
            notInArray(emailSuppressions.email, keep)
          )
        : eq(emailSuppressions.source, source)
    )
    .returning({ id: emailSuppressions.id })
  return deleted.length
}
