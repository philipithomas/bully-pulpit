import { getRun } from 'workflow/api'
import { WorkflowRunNotFoundError } from 'workflow/errors'
import {
  allLatestRunIds,
  deleteSendRunIfMatches,
  latestRunIdBySlug,
} from '@/lib/db/queries/send-runs'

const RUN_STATUS_CONCURRENCY = 8

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
  return isRunActive(slug, runId)
}

async function isRunActive(slug: string, runId: string): Promise<boolean> {
  try {
    const status = await getRun(runId).status
    if (status === 'pending' || status === 'running') return true

    if (
      status !== 'completed' &&
      status !== 'failed' &&
      status !== 'cancelled'
    ) {
      throw new Error(`Unknown Workflow run status: ${String(status)}`)
    }

    // completed/failed/cancelled are terminal. Forget the row so future Posts
    // page loads do not probe the same historical run forever.
    await deleteSendRunIfMatches(slug, runId)
    return false
  } catch (error) {
    if (WorkflowRunNotFoundError.is(error)) {
      // The runtime pruned or never knew this run. It cannot be live, and the
      // local row would otherwise cause the same failed probe on every load.
      await deleteSendRunIfMatches(slug, runId)
      return false
    }

    // A timeout, throttle, or backend error does not prove that the run died.
    // Mutation guards must fail closed rather than risk starting a second run.
    throw error
  }
}

/**
 * Post slugs whose latest recorded send run is still pending or running.
 *
 * Terminal and missing rows are pruned after their first observation. Probes
 * use a small worker pool so a one-time cleanup of historical rows does not
 * fan out an unbounded number of remote Workflow requests. Unknown failures
 * stay recorded and render conservatively as active until a later probe can
 * establish a terminal state.
 */
export async function activeSendRunSlugs(): Promise<Set<string>> {
  const runs = await allLatestRunIds()
  const entries = Object.entries(runs)
  const active = new Set<string>()
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(RUN_STATUS_CONCURRENCY, entries.length) },
    async () => {
      while (nextIndex < entries.length) {
        const entry = entries[nextIndex]
        nextIndex += 1
        const [slug, runId] = entry
        try {
          if (await isRunActive(slug, runId)) active.add(slug)
        } catch (error) {
          console.error(
            `[send-guard] Could not inspect Workflow run ${runId}:`,
            error
          )
          active.add(slug)
        }
      }
    }
  )

  await Promise.all(workers)
  return active
}
