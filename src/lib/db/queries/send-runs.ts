import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { sendRuns } from '@/lib/db/schema'

/**
 * Records the runId of the workflow run just started for a post, replacing any
 * previous one. Keyed by post_slug (a post sends once, but a resume starts a
 * fresh run for the same slug), so the guards always check the latest run.
 */
export async function recordSendRun(
  postSlug: string,
  runId: string
): Promise<void> {
  await getDb()
    .insert(sendRuns)
    .values({ postSlug, runId, startedAt: sql`NOW()` })
    .onConflictDoUpdate({
      target: sendRuns.postSlug,
      set: { runId, startedAt: sql`NOW()` },
    })
}

/** The runId of the most recent send started for a post, or null if none. */
export async function latestRunIdBySlug(
  postSlug: string
): Promise<string | null> {
  const rows = await getDb()
    .select({ runId: sendRuns.runId })
    .from(sendRuns)
    .where(eq(sendRuns.postSlug, postSlug))
    .limit(1)
  return rows[0]?.runId ?? null
}
