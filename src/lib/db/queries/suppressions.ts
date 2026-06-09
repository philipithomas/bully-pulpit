import { and, eq, notInArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { emailSuppressions } from '@/lib/db/schema'

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
      set: { reason, source: source ?? null },
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
