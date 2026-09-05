import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { cronHealthSnapshot } from '@/lib/cron/jobs'
import {
  listCronJobHealth,
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/db/queries/cron-job-health'
import { cronJobHealth, cronJobHealthActivations } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

const healthRowsCreatedByMigrations = await db.select().from(cronJobHealth)
const activationsCreatedByMigrations = await db
  .select()
  .from(cronJobHealthActivations)

beforeEach(async () => {
  vi.stubEnv('VERCEL_ENV', 'development')
  await resetDb()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('cron job health persistence', () => {
  it('does not start monitoring during the pre-build migration', () => {
    expect(healthRowsCreatedByMigrations).toEqual([])
    expect(activationsCreatedByMigrations).toEqual([])
  })

  it('keeps preview health reads read-only', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')

    expect(await listCronJobHealth()).toEqual([])
    expect(await db.select().from(cronJobHealth)).toEqual([])
    expect(await db.select().from(cronJobHealthActivations)).toEqual([])
  })

  it('blocks every preview lifecycle write against a shared database', async () => {
    const monitoringStartedAt = new Date('2026-09-01T10:00:00.000Z')
    const lastSucceededAt = new Date('2026-09-05T10:00:00.000Z')
    await db.insert(cronJobHealth).values({
      jobName: 'suppression-sync',
      monitoringStartedAt,
      lastSucceededAt,
      updatedAt: lastSucceededAt,
    })
    vi.stubEnv('VERCEL_ENV', 'preview')

    await markCronJobStarted(
      'suppression-sync',
      new Date('2026-09-06T10:00:00.000Z')
    )
    await markCronJobSucceeded(
      'subscriber-backup',
      new Date('2026-09-06T10:00:01.000Z')
    )
    await markCronJobFailed(
      'bell-retention',
      'bell_retention_failed',
      new Date('2026-09-06T10:00:02.000Z')
    )
    const rows = await listCronJobHealth()

    expect(rows).toEqual([
      expect.objectContaining({
        jobName: 'suppression-sync',
        monitoringStartedAt,
        lastSucceededAt,
        lastStartedAt: null,
        lastFailedAt: null,
        updatedAt: lastSucceededAt,
      }),
    ])
    expect(await db.select().from(cronJobHealthActivations)).toEqual([])
  })

  it('upserts the latest lifecycle timestamps without an execution log', async () => {
    const startedAt = new Date('2026-09-05T10:00:00.000Z')
    const succeededAt = new Date('2026-09-05T10:00:04.000Z')
    const failedAt = new Date('2026-09-06T10:00:05.000Z')

    await markCronJobStarted('bell-retention', startedAt)
    await markCronJobSucceeded('bell-retention', succeededAt)
    await markCronJobFailed('bell-retention', 'bell_retention_failed', failedAt)

    const rows = await listCronJobHealth()
    expect(rows.map((row) => row.jobName)).toEqual([
      'bell-retention',
      'subscriber-backup',
      'suppression-sync',
    ])
    expect(rows.find((row) => row.jobName === 'bell-retention')).toEqual(
      expect.objectContaining({
        lastStartedAt: startedAt,
        lastSucceededAt: succeededAt,
        lastFailedAt: failedAt,
        lastFailureCode: 'bell_retention_failed',
        monitoringStartedAt: expect.any(Date),
      })
    )
  })

  it('activates every fixed job on the first deployed-code read', async () => {
    const before = Date.now()
    const rows = await listCronJobHealth()
    const after = Date.now()
    const activations = await db.select().from(cronJobHealthActivations)

    expect(activations).toEqual([
      expect.objectContaining({ activationKey: 'fixed-jobs-v1' }),
    ])
    expect(rows.map((row) => row.jobName)).toEqual([
      'bell-retention',
      'subscriber-backup',
      'suppression-sync',
    ])
    for (const row of rows) {
      expect(row.monitoringStartedAt).toEqual(activations[0]?.activatedAt)
      expect(row.monitoringStartedAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(row.monitoringStartedAt.getTime()).toBeLessThanOrEqual(after)
      expect(row.lastStartedAt).toBeNull()
      expect(row.lastSucceededAt).toBeNull()
      expect(row.lastFailedAt).toBeNull()
    }
  })

  it('activates the fixed roster exactly once under concurrent first reads', async () => {
    const [first, second] = await Promise.all([
      listCronJobHealth(),
      listCronJobHealth(),
    ])
    const activations = await db.select().from(cronJobHealthActivations)
    const storedRows = await db
      .select()
      .from(cronJobHealth)
      .orderBy(cronJobHealth.jobName)

    expect(first).toHaveLength(3)
    expect(second).toHaveLength(3)
    expect(activations).toHaveLength(1)
    expect(storedRows).toHaveLength(3)
    for (const row of storedRows) {
      expect(row.monitoringStartedAt).toEqual(activations[0]?.activatedAt)
    }
  })

  it('preserves existing monitoring history while filling missing jobs', async () => {
    const monitoringStartedAt = new Date('2026-08-01T12:00:00.000Z')
    const lastSucceededAt = new Date('2026-09-05T11:45:00.000Z')
    await db.insert(cronJobHealth).values({
      jobName: 'suppression-sync',
      monitoringStartedAt,
      lastSucceededAt,
    })

    const rows = await listCronJobHealth()
    const suppression = rows.find((row) => row.jobName === 'suppression-sync')

    expect(rows).toHaveLength(3)
    expect(suppression).toEqual(
      expect.objectContaining({ monitoringStartedAt, lastSucceededAt })
    )
  })

  it('does not reseed a missing job after the roster was activated', async () => {
    await listCronJobHealth()
    await db
      .delete(cronJobHealth)
      .where(eq(cronJobHealth.jobName, 'subscriber-backup'))

    const rows = await listCronJobHealth()
    const snapshot = cronHealthSnapshot(rows)

    expect(rows.map((row) => row.jobName)).toEqual([
      'bell-retention',
      'suppression-sync',
    ])
    expect(snapshot.ok).toBe(false)
    expect(
      snapshot.jobs.find((job) => job.name === 'subscriber-backup')
    ).toEqual(expect.objectContaining({ status: 'missing' }))
    expect(await db.select().from(cronJobHealthActivations)).toHaveLength(1)
  })

  it('lets a real heartbeat restore only its own missing row', async () => {
    await listCronJobHealth()
    await db
      .delete(cronJobHealth)
      .where(eq(cronJobHealth.jobName, 'subscriber-backup'))
    const startedAt = new Date('2026-09-07T11:00:00.000Z')

    await markCronJobStarted('subscriber-backup', startedAt)

    const rows = await listCronJobHealth()
    expect(rows).toHaveLength(3)
    expect(rows.find((row) => row.jobName === 'subscriber-backup')).toEqual(
      expect.objectContaining({
        monitoringStartedAt: startedAt,
        lastStartedAt: startedAt,
        updatedAt: startedAt,
      })
    )
    expect(await db.select().from(cronJobHealthActivations)).toHaveLength(1)
  })

  it('keeps lifecycle timestamps monotonic when older writes settle last', async () => {
    const newerStartedAt = new Date('2030-01-03T10:00:00.000Z')
    const newerSucceededAt = new Date('2030-01-04T10:00:00.000Z')
    const newerFailedAt = new Date('2030-01-05T10:00:00.000Z')

    await markCronJobStarted('suppression-sync', newerStartedAt)
    await markCronJobStarted(
      'suppression-sync',
      new Date('2030-01-01T10:00:00.000Z')
    )
    await markCronJobSucceeded('suppression-sync', newerSucceededAt)
    await markCronJobSucceeded(
      'suppression-sync',
      new Date('2030-01-02T10:00:00.000Z')
    )
    await markCronJobFailed(
      'suppression-sync',
      'suppression_sync_failed',
      newerFailedAt
    )
    await markCronJobFailed(
      'suppression-sync',
      'subscriber_backup_failed',
      new Date('2030-01-02T10:00:00.000Z')
    )

    const rows = await db.select().from(cronJobHealth)
    expect(rows).toEqual([
      expect.objectContaining({
        jobName: 'suppression-sync',
        lastStartedAt: newerStartedAt,
        lastSucceededAt: newerSucceededAt,
        lastFailedAt: newerFailedAt,
        lastFailureCode: 'suppression_sync_failed',
        updatedAt: newerFailedAt,
      }),
    ])
  })
})
