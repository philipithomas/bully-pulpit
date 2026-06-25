import { getRun } from 'workflow/api'
import { allLatestRunIds, latestRunIdBySlug } from '@/lib/db/queries/send-runs'

/**
 * Whether a workflow run for this post is genuinely still in flight.
 *
 * The send and retry guards must NOT infer "a run is active" from pending
 * email_sends rows: pending rows OUTLIVE a run that died (a sustained SES
 * throttle exhausts sendBatch's retries, a dashboard cancellation, or a throw
 * after the heal all leave rows pending with no live run). Inferring from
 * pending rows deadlocks resume — retry is the designed resume path for exactly
 * that stalled state.
 *
 * Instead we persist the runId of each start (recordSendRun) and ask the
 * Workflow runtime for its real status. Only pending/running counts as live;
 * completed/failed/cancelled (or a runId the runtime no longer knows) means the
 * run is done and a retry/send may take over the leftover pending rows.
 */
export async function isSendRunActive(slug: string): Promise<boolean> {
  const runId = await latestRunIdBySlug(slug)
  if (!runId) return false
  return isRunActive(runId)
}

async function isRunActive(runId: string): Promise<boolean> {
  try {
    const status = await getRun(runId).status
    return status === 'pending' || status === 'running'
  } catch {
    // The runtime no longer knows this run (expired/pruned). Treat as not
    // active so a stalled send is never permanently un-resumable; the unique
    // enqueue index plus per-row sendable re-reads bound any duplicate risk.
    return false
  }
}

/** Post slugs whose latest recorded send run is still pending or running. */
export async function activeSendRunSlugs(): Promise<Set<string>> {
  const runs = await allLatestRunIds()
  const active = await Promise.all(
    Object.entries(runs).map(async ([slug, runId]) =>
      (await isRunActive(runId)) ? slug : null
    )
  )
  return new Set(active.filter((slug): slug is string => Boolean(slug)))
}
