import { type CronJobName, cronJobDefinition } from '@/lib/cron/jobs'
import {
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/db/queries/cron-job-health'

type HeartbeatPhase = 'started' | 'succeeded' | 'failed'
type HeartbeatOutcome =
  | { kind: 'succeeded' }
  | { kind: 'failed'; errorKind: string }
  | { kind: 'timed_out' }

const HEARTBEAT_SETTLE_TIMEOUT_MS = 1_000

async function bestEffort(
  jobName: CronJobName,
  phase: HeartbeatPhase,
  write: () => Promise<void>
): Promise<void> {
  // Attach both settlement handlers before racing the timeout. If the write
  // rejects after this function has already returned, it is still consumed
  // here rather than becoming an unhandled rejection.
  const writeOutcome: Promise<HeartbeatOutcome> = Promise.resolve()
    .then(write)
    .then(
      () => ({ kind: 'succeeded' }),
      (error: unknown) => ({
        kind: 'failed',
        errorKind: error instanceof Error ? error.name : 'UnknownError',
      })
    )

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutOutcome = new Promise<HeartbeatOutcome>((resolve) => {
    timer = setTimeout(
      () => resolve({ kind: 'timed_out' }),
      HEARTBEAT_SETTLE_TIMEOUT_MS
    )
  })
  const outcome = await Promise.race([writeOutcome, timeoutOutcome])
  if (timer) clearTimeout(timer)

  // Heartbeats observe a job; they never become the job. Do not turn a
  // successful backup/cleanup/sync into a provider retry just because this
  // diagnostic write failed. Log no provider or database error text.
  if (outcome.kind === 'failed') {
    console.error(
      `[cron/${jobName}] ${phase} heartbeat failed (${outcome.errorKind})`
    )
  } else if (outcome.kind === 'timed_out') {
    console.error(`[cron/${jobName}] ${phase} heartbeat timed out`)
  }
}

export function recordCronStarted(jobName: CronJobName): Promise<void> {
  return bestEffort(jobName, 'started', () => markCronJobStarted(jobName))
}

export function recordCronSucceeded(jobName: CronJobName): Promise<void> {
  return bestEffort(jobName, 'succeeded', () => markCronJobSucceeded(jobName))
}

export function recordCronFailed(jobName: CronJobName): Promise<void> {
  const { failureCode } = cronJobDefinition(jobName)
  return bestEffort(jobName, 'failed', () =>
    markCronJobFailed(jobName, failureCode)
  )
}
