import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { sendRuns } from '@/lib/db/schema'

export interface RecordedSendRun {
  postSlug: string
  runId: string
  startedAt: Date
}

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

/** The most recent send run recorded for a post, or null if none. */
export async function latestRunBySlug(
  postSlug: string
): Promise<RecordedSendRun | null> {
  const rows = await getDb()
    .select({
      postSlug: sendRuns.postSlug,
      runId: sendRuns.runId,
      startedAt: sendRuns.startedAt,
    })
    .from(sendRuns)
    .where(eq(sendRuns.postSlug, postSlug))
    .limit(1)
  return rows[0] ?? null
}

/** The runId of the most recent send started for a post, or null if none. */
export async function latestRunIdBySlug(
  postSlug: string
): Promise<string | null> {
  return (await latestRunBySlug(postSlug))?.runId ?? null
}

/** All unresolved send runs that still require a Workflow status probe. */
export async function allLatestRuns(): Promise<RecordedSendRun[]> {
  return getDb()
    .select({
      postSlug: sendRuns.postSlug,
      runId: sendRuns.runId,
      startedAt: sendRuns.startedAt,
    })
    .from(sendRuns)
}

/** Latest recorded send run ids, keyed by post slug. */
export async function allLatestRunIds(): Promise<Record<string, string>> {
  const rows = await allLatestRuns()
  return Object.fromEntries(rows.map((row) => [row.postSlug, row.runId]))
}

/**
 * Removes a terminal run only if it is still the latest run for this post.
 *
 * The run-status probe and this delete are separated by a remote request. A
 * retry may start and replace the row during that gap, so matching both the
 * slug and run id is what prevents an old probe from deleting the fresh run.
 */
export async function deleteSendRunIfMatches(
  postSlug: string,
  runId: string
): Promise<boolean> {
  const deleted = await getDb()
    .delete(sendRuns)
    .where(and(eq(sendRuns.postSlug, postSlug), eq(sendRuns.runId, runId)))
    .returning({ postSlug: sendRuns.postSlug })
  return deleted.length > 0
}
