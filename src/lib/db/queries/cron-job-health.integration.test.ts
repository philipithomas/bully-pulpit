import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  listCronJobHealth,
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/db/queries/cron-job-health'
import { cronJobHealth } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

const rowsCreatedByMigrations = await db.select().from(cronJobHealth)

beforeEach(resetDb)

describe('cron job health persistence', () => {
  it('does not start monitoring during the pre-build migration', () => {
    expect(rowsCreatedByMigrations).toEqual([])
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

    expect(rows.map((row) => row.jobName)).toEqual([
      'bell-retention',
      'subscriber-backup',
      'suppression-sync',
    ])
    for (const row of rows) {
      expect(row.monitoringStartedAt.getTime()).toBeGreaterThanOrEqual(before)
      expect(row.monitoringStartedAt.getTime()).toBeLessThanOrEqual(after)
      expect(row.lastStartedAt).toBeNull()
      expect(row.lastSucceededAt).toBeNull()
      expect(row.lastFailedAt).toBeNull()
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
})
