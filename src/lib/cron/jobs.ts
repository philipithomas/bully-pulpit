import type { CronJobHealth } from '@/lib/db/schema'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const CRON_JOBS = [
  {
    name: 'suppression-sync',
    label: 'SES suppression sync',
    path: '/api/cron/suppression-sync',
    schedule: '*/15 * * * *',
    cadence: 'Every 15 minutes',
    staleAfterMs: 45 * MINUTE,
    maxRuntimeMs: 10 * MINUTE,
    failureCode: 'suppression_sync_failed',
  },
  {
    name: 'bell-retention',
    label: 'Bell retention',
    path: '/api/cron/bell-retention',
    schedule: '17 10 * * *',
    cadence: 'Daily at 10:17 UTC',
    staleAfterMs: 36 * HOUR,
    maxRuntimeMs: 15 * MINUTE,
    failureCode: 'bell_retention_failed',
  },
  {
    name: 'subscriber-backup',
    label: 'Subscriber backup',
    path: '/api/cron/subscriber-backup',
    schedule: '0 11 1 * *',
    cadence: 'Monthly on the first at 11:00 UTC',
    staleAfterMs: 36 * DAY,
    maxRuntimeMs: 15 * MINUTE,
    failureCode: 'subscriber_backup_failed',
  },
  {
    name: 'morning-report',
    label: 'Admin morning report',
    path: '/api/cron/morning-report',
    schedule: '*/15 11,12 * * *',
    cadence: 'Daily at 7am America/New_York',
    staleAfterMs: 36 * HOUR,
    maxRuntimeMs: 30 * MINUTE,
    failureCode: 'morning_report_failed',
  },
] as const

export type CronJobDefinition = (typeof CRON_JOBS)[number]
export type CronJobName = CronJobDefinition['name']
export type CronFailureCode = CronJobDefinition['failureCode']
export type CronHealthStatus =
  | 'healthy'
  | 'running'
  | 'pending'
  | 'failing'
  | 'stale'
  | 'missing'

export type CronJobSnapshot = {
  name: CronJobName
  label: string
  cadence: string
  status: CronHealthStatus
  monitoringStartedAt: string | null
  lastStartedAt: string | null
  lastSucceededAt: string | null
  lastFailedAt: string | null
  lastFailureCode: string | null
  nextExpectedBy: string | null
}

export type CronHealthSnapshot = {
  ok: boolean
  checkedAt: string
  jobs: CronJobSnapshot[]
}

export function cronJobDefinition(name: CronJobName): CronJobDefinition {
  const definition = CRON_JOBS.find((job) => job.name === name)
  if (!definition) {
    // `name` is a closed union at compile time. Retain a runtime guard at this
    // boundary so a future unchecked caller cannot create an unclassified row.
    throw new Error(`Unknown cron job: ${name}`)
  }
  return definition
}

function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null
}

function latestDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}

function snapshotJob(
  definition: CronJobDefinition,
  row: CronJobHealth | undefined,
  now: Date
): CronJobSnapshot {
  if (!row) {
    return {
      name: definition.name,
      label: definition.label,
      cadence: definition.cadence,
      status: 'missing',
      monitoringStartedAt: null,
      lastStartedAt: null,
      lastSucceededAt: null,
      lastFailedAt: null,
      lastFailureCode: null,
      nextExpectedBy: null,
    }
  }

  const lastOutcome = latestDate(row.lastSucceededAt, row.lastFailedAt)
  const cadenceBase = row.lastSucceededAt ?? row.monitoringStartedAt
  const cadenceIsStale =
    now.getTime() - cadenceBase.getTime() > definition.staleAfterMs

  let status: CronHealthStatus
  if (cadenceIsStale) {
    // Starting another run is useful evidence that Vercel invoked the route,
    // but it cannot restore health. Stay failed closed until that run records
    // a success and advances the completed-work heartbeat.
    status = 'stale'
  } else if (
    row.lastFailedAt &&
    (!row.lastSucceededAt || row.lastFailedAt >= row.lastSucceededAt)
  ) {
    status = 'failing'
  } else if (
    row.lastStartedAt &&
    (lastOutcome === null || row.lastStartedAt > lastOutcome)
  ) {
    status =
      now.getTime() - row.lastStartedAt.getTime() <= definition.maxRuntimeMs
        ? 'running'
        : 'stale'
  } else if (row.lastSucceededAt) {
    status = 'healthy'
  } else {
    status = 'pending'
  }

  const nextExpectedBy = new Date(
    cadenceBase.getTime() + definition.staleAfterMs
  )
  const lastFailureCode = row.lastFailureCode
    ? row.lastFailureCode === definition.failureCode
      ? definition.failureCode
      : 'unknown_failure'
    : null

  return {
    name: definition.name,
    label: definition.label,
    cadence: definition.cadence,
    status,
    monitoringStartedAt: iso(row.monitoringStartedAt),
    lastStartedAt: iso(row.lastStartedAt),
    lastSucceededAt: iso(row.lastSucceededAt),
    lastFailedAt: iso(row.lastFailedAt),
    lastFailureCode,
    nextExpectedBy: nextExpectedBy.toISOString(),
  }
}

/** Build the fixed, redacted status contract used by admin and dead-man checks. */
export function cronHealthSnapshot(
  rows: CronJobHealth[],
  now = new Date()
): CronHealthSnapshot {
  const byName = new Map(rows.map((row) => [row.jobName, row]))
  const jobs = CRON_JOBS.map((definition) =>
    snapshotJob(definition, byName.get(definition.name), now)
  )

  return {
    ok: jobs.every((job) =>
      ['healthy', 'running', 'pending'].includes(job.status)
    ),
    checkedAt: now.toISOString(),
    jobs,
  }
}
