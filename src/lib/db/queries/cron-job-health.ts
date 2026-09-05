import { asc } from 'drizzle-orm'
import type { CronFailureCode, CronJobName } from '@/lib/cron/jobs'
import { getDb } from '@/lib/db/client'
import { type CronJobHealth, cronJobHealth } from '@/lib/db/schema'

export async function markCronJobStarted(
  jobName: CronJobName,
  at = new Date()
): Promise<void> {
  await getDb()
    .insert(cronJobHealth)
    .values({ jobName, lastStartedAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: cronJobHealth.jobName,
      set: { lastStartedAt: at, updatedAt: at },
    })
}

export async function markCronJobSucceeded(
  jobName: CronJobName,
  at = new Date()
): Promise<void> {
  await getDb()
    .insert(cronJobHealth)
    .values({ jobName, lastSucceededAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: cronJobHealth.jobName,
      set: { lastSucceededAt: at, updatedAt: at },
    })
}

export async function markCronJobFailed(
  jobName: CronJobName,
  failureCode: CronFailureCode,
  at = new Date()
): Promise<void> {
  await getDb()
    .insert(cronJobHealth)
    .values({
      jobName,
      lastFailedAt: at,
      lastFailureCode: failureCode,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: cronJobHealth.jobName,
      set: {
        lastFailedAt: at,
        lastFailureCode: failureCode,
        updatedAt: at,
      },
    })
}

export async function listCronJobHealth(): Promise<CronJobHealth[]> {
  return getDb()
    .select()
    .from(cronJobHealth)
    .orderBy(asc(cronJobHealth.jobName))
}
