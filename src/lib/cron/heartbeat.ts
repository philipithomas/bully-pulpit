import { type CronJobName, cronJobDefinition } from '@/lib/cron/jobs'
import {
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/db/queries/cron-job-health'

type HeartbeatPhase = 'started' | 'succeeded' | 'failed'

async function bestEffort(
  jobName: CronJobName,
  phase: HeartbeatPhase,
  write: () => Promise<void>
): Promise<void> {
  try {
    await write()
  } catch (error) {
    // Heartbeats observe a job; they never become the job. Do not turn a
    // successful backup/cleanup/sync into a provider retry just because this
    // diagnostic write failed. Log only the error class, never a DB message.
    const errorKind = error instanceof Error ? error.name : 'UnknownError'
    console.error(`[cron/${jobName}] ${phase} heartbeat failed (${errorKind})`)
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
