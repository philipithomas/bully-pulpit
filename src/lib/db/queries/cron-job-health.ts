import { asc, sql } from 'drizzle-orm'
import { cronHealthWritesAllowed } from '@/lib/cron/environment'
import {
  CRON_JOBS,
  type CronFailureCode,
  type CronJobName,
} from '@/lib/cron/jobs'
import { getDb } from '@/lib/db/client'
import {
  type CronJobHealth,
  cronJobHealth,
  cronJobHealthActivations,
} from '@/lib/db/schema'

// Bump this only when intentionally activating a changed fixed-job roster.
// A stable key ensures an accidentally deleted heartbeat row remains missing
// and fails health checks rather than receiving a fresh grace period.
const CRON_HEALTH_ACTIVATION_KEY = 'fixed-jobs-v2'

function greatestTimestamp(column: typeof cronJobHealth.updatedAt, at: Date) {
  return sql<Date>`GREATEST(${column}, ${at})`
}

function greatestNullableTimestamp(
  column:
    | typeof cronJobHealth.lastStartedAt
    | typeof cronJobHealth.lastSucceededAt
    | typeof cronJobHealth.lastFailedAt,
  at: Date
) {
  return sql<Date>`GREATEST(COALESCE(${column}, ${at}), ${at})`
}

export async function markCronJobStarted(
  jobName: CronJobName,
  at = new Date()
): Promise<void> {
  if (!cronHealthWritesAllowed()) return

  await getDb()
    .insert(cronJobHealth)
    .values({
      jobName,
      monitoringStartedAt: at,
      lastStartedAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: cronJobHealth.jobName,
      set: {
        lastStartedAt: greatestNullableTimestamp(
          cronJobHealth.lastStartedAt,
          at
        ),
        updatedAt: greatestTimestamp(cronJobHealth.updatedAt, at),
      },
    })
}

export async function markCronJobSucceeded(
  jobName: CronJobName,
  at = new Date()
): Promise<void> {
  if (!cronHealthWritesAllowed()) return

  await getDb()
    .insert(cronJobHealth)
    .values({
      jobName,
      monitoringStartedAt: at,
      lastSucceededAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: cronJobHealth.jobName,
      set: {
        lastSucceededAt: greatestNullableTimestamp(
          cronJobHealth.lastSucceededAt,
          at
        ),
        updatedAt: greatestTimestamp(cronJobHealth.updatedAt, at),
      },
    })
}

export async function markCronJobFailed(
  jobName: CronJobName,
  failureCode: CronFailureCode,
  at = new Date()
): Promise<void> {
  if (!cronHealthWritesAllowed()) return

  await getDb()
    .insert(cronJobHealth)
    .values({
      jobName,
      monitoringStartedAt: at,
      lastFailedAt: at,
      lastFailureCode: failureCode,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: cronJobHealth.jobName,
      set: {
        lastFailedAt: greatestNullableTimestamp(cronJobHealth.lastFailedAt, at),
        lastFailureCode: sql<string>`CASE
          WHEN ${cronJobHealth.lastFailedAt} IS NULL
            OR ${at} > ${cronJobHealth.lastFailedAt}
          THEN ${failureCode}
          ELSE ${cronJobHealth.lastFailureCode}
        END`,
        updatedAt: greatestTimestamp(cronJobHealth.updatedAt, at),
      },
    })
}

export async function listCronJobHealth(): Promise<CronJobHealth[]> {
  const db = getDb()
  // The migration deliberately creates an empty table: production migrations
  // run before the app build, which may fail. The first successfully deployed
  // write-eligible health read atomically claims the versioned activation and
  // seeds the fixed roster at that exact time. Preview reads remain read-only.
  // Later reads cannot hide row loss by reseeding; a real heartbeat may still
  // recreate its own job row.
  if (cronHealthWritesAllowed()) {
    const jobValues = sql.join(
      CRON_JOBS.map(({ name }) => sql`(${name})`),
      sql`, `
    )
    await db.execute(sql`
      WITH activation AS (
        INSERT INTO ${cronJobHealthActivations} ("activation_key")
        VALUES (${CRON_HEALTH_ACTIVATION_KEY})
        ON CONFLICT ("activation_key") DO NOTHING
        RETURNING "activated_at"
      )
      INSERT INTO ${cronJobHealth}
        ("job_name", "monitoring_started_at", "updated_at")
      SELECT jobs.job_name, activation.activated_at, activation.activated_at
      FROM activation
      CROSS JOIN (VALUES ${jobValues}) AS jobs(job_name)
      ON CONFLICT ("job_name") DO NOTHING
    `)
  }

  return db.select().from(cronJobHealth).orderBy(asc(cronJobHealth.jobName))
}
