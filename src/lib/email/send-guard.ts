import { getRun } from 'workflow/api'
import { WorkflowRunNotFoundError } from 'workflow/errors'
import {
  allLatestRuns,
  deleteSendRunIfMatches,
  latestRunBySlug,
  type RecordedSendRun,
} from '@/lib/db/queries/send-runs'

const RUN_STATUS_CONCURRENCY = 8
// Workflow 4.6's resilient start retries a temporarily missing accepted run
// for 10 seconds. Keep three times that horizon for backend propagation margin.
export const SEND_RUN_NOT_FOUND_GRACE_MS = 30_000

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
 * completed/failed/cancelled means the run is done and a retry/send may take
 * over the leftover pending rows. A typed missing run is treated as live for a
 * short grace period because Workflow resilient start can accept a run before
 * its status is visible.
 */
export async function isSendRunActive(slug: string): Promise<boolean> {
  const run = await latestRunBySlug(slug)
  if (!run) return false
  return isRunActive(run)
}

async function isRunActive({
  postSlug,
  runId,
  startedAt,
}: RecordedSendRun): Promise<boolean> {
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
    await deleteSendRunIfMatches(postSlug, runId)
    return false
  } catch (error) {
    if (WorkflowRunNotFoundError.is(error)) {
      if (Date.now() - startedAt.getTime() < SEND_RUN_NOT_FOUND_GRACE_MS) {
        // Resilient start can enqueue an accepted run before its run_created
        // record is queryable. Keep the only local guard until that propagation
        // window is safely past, or a later probe reports a real status.
        return true
      }

      // Outside the resilient-start window, a typed missing result means the
      // runtime pruned or never knew this run. Remove the stale local guard.
      await deleteSendRunIfMatches(postSlug, runId)
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
 * Terminal and stale-missing rows are pruned after their first authoritative
 * observation. Recent missing and unknown runs stay recorded and render
 * conservatively as active. Probes use a small worker pool so a one-time
 * cleanup of historical rows cannot fan out unbounded remote requests.
 */
export async function activeSendRunSlugs(): Promise<Set<string>> {
  const runs = await allLatestRuns()
  const active = new Set<string>()
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(RUN_STATUS_CONCURRENCY, runs.length) },
    async () => {
      while (nextIndex < runs.length) {
        const run = runs[nextIndex]
        nextIndex += 1
        try {
          if (await isRunActive(run)) active.add(run.postSlug)
        } catch (error) {
          console.error(
            `[send-guard] Could not inspect Workflow run ${run.runId}:`,
            error
          )
          active.add(run.postSlug)
        }
      }
    }
  )

  await Promise.all(workers)
  return active
}
