import { eq } from 'drizzle-orm'
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
