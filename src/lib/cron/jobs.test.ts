import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CRON_JOBS,
  type CronJobName,
  cronHealthSnapshot,
} from '@/lib/cron/jobs'
import type { CronJobHealth } from '@/lib/db/schema'

const NOW = new Date('2026-09-05T12:00:00.000Z')
const vercelConfig = JSON.parse(
  readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')
) as { crons: Array<{ path: string; schedule: string }> }

function row(
  jobName: CronJobName,
  overrides: Partial<CronJobHealth> = {}
): CronJobHealth {
  return {
    jobName,
    monitoringStartedAt: new Date('2026-09-05T11:59:00.000Z'),
    lastStartedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastFailureCode: null,
    updatedAt: new Date('2026-09-05T11:59:00.000Z'),
    ...overrides,
  }
}

describe('cron job registry', () => {
  it('describes every scheduled Vercel cron with the exact path and schedule', () => {
    expect(CRON_JOBS.map(({ path, schedule }) => ({ path, schedule }))).toEqual(
      vercelConfig.crons
    )
  })
})

describe('cronHealthSnapshot', () => {
  it('keeps newly monitored jobs healthy while awaiting their first run', () => {
    const snapshot = cronHealthSnapshot(
      CRON_JOBS.map((job) => row(job.name)),
      NOW
    )

    expect(snapshot.ok).toBe(true)
    expect(snapshot.jobs.map((job) => job.status)).toEqual([
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('reports recent success, an active run, and the latest fixed failure', () => {
    const snapshot = cronHealthSnapshot(
      [
        row('suppression-sync', {
          lastStartedAt: new Date('2026-09-05T11:50:00.000Z'),
          lastSucceededAt: new Date('2026-09-05T11:51:00.000Z'),
        }),
        row('bell-retention', {
          lastStartedAt: new Date('2026-09-05T11:55:00.000Z'),
        }),
        row('subscriber-backup', {
          lastStartedAt: new Date('2026-09-05T10:00:00.000Z'),
          lastFailedAt: new Date('2026-09-05T10:01:00.000Z'),
          lastFailureCode: 'subscriber_backup_failed',
        }),
      ],
      NOW
    )

    expect(snapshot.ok).toBe(false)
    expect(snapshot.jobs.map((job) => job.status)).toEqual([
      'healthy',
      'running',
      'failing',
      'missing',
    ])
    expect(snapshot.jobs[2].lastFailureCode).toBe('subscriber_backup_failed')
  })

  it('flags an unfinished run and an old success after their grace windows', () => {
    const snapshot = cronHealthSnapshot(
      [
        row('suppression-sync', {
          lastStartedAt: new Date('2026-09-05T11:45:00.000Z'),
        }),
        row('bell-retention', {
          lastStartedAt: new Date('2026-09-03T10:17:00.000Z'),
          lastSucceededAt: new Date('2026-09-03T10:18:00.000Z'),
        }),
        row('subscriber-backup'),
      ],
      NOW
    )

    expect(snapshot.ok).toBe(false)
    expect(snapshot.jobs[0].status).toBe('stale')
    expect(snapshot.jobs[1].status).toBe('stale')
  })

  it('does not let a recent start mask a stale success heartbeat', () => {
    const snapshot = cronHealthSnapshot(
      [
        row('suppression-sync', {
          lastStartedAt: new Date('2026-09-05T11:59:00.000Z'),
          lastSucceededAt: new Date('2026-09-05T11:00:00.000Z'),
        }),
        row('bell-retention', {
          lastStartedAt: new Date('2026-09-05T10:17:00.000Z'),
          lastSucceededAt: new Date('2026-09-05T10:18:00.000Z'),
        }),
        row('subscriber-backup', {
          lastStartedAt: new Date('2026-09-01T11:00:00.000Z'),
          lastSucceededAt: new Date('2026-09-01T11:01:00.000Z'),
        }),
      ],
      NOW
    )

    expect(snapshot.jobs[0].status).toBe('stale')
    expect(snapshot.ok).toBe(false)
  })

  it('does not let a first start mask an expired initial grace period', () => {
    const snapshot = cronHealthSnapshot(
      [
        row('suppression-sync', {
          monitoringStartedAt: new Date('2026-09-05T11:00:00.000Z'),
          lastStartedAt: new Date('2026-09-05T11:59:00.000Z'),
        }),
      ],
      NOW
    )

    expect(snapshot.jobs[0].status).toBe('stale')
    expect(snapshot.ok).toBe(false)
  })

  it('fails closed when a configured job has no durable registry row', () => {
    const snapshot = cronHealthSnapshot([], NOW)

    expect(snapshot.ok).toBe(false)
    expect(snapshot.jobs.every((job) => job.status === 'missing')).toBe(true)
  })

  it('redacts an unexpected stored failure value at the API boundary', () => {
    const snapshot = cronHealthSnapshot(
      [
        row('suppression-sync', {
          lastFailedAt: NOW,
          lastFailureCode: 'postgres://user:secret@example.test/private',
        }),
      ],
      NOW
    )

    expect(snapshot.jobs[0].lastFailureCode).toBe('unknown_failure')
    expect(JSON.stringify(snapshot)).not.toContain('secret')
  })
})
