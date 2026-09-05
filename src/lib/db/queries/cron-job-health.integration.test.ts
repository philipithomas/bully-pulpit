import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  listCronJobHealth,
  markCronJobFailed,
  markCronJobStarted,
  markCronJobSucceeded,
} from '@/lib/db/queries/cron-job-health'
import { resetDb } from '@/test/integration/db'

beforeEach(resetDb)

describe('cron job health persistence', () => {
  it('upserts the latest lifecycle timestamps without an execution log', async () => {
    const startedAt = new Date('2026-09-05T10:00:00.000Z')
    const succeededAt = new Date('2026-09-05T10:00:04.000Z')
    const failedAt = new Date('2026-09-06T10:00:05.000Z')

    await markCronJobStarted('bell-retention', startedAt)
    await markCronJobSucceeded('bell-retention', succeededAt)
    await markCronJobFailed('bell-retention', 'bell_retention_failed', failedAt)

    expect(await listCronJobHealth()).toEqual([
      expect.objectContaining({
        jobName: 'bell-retention',
        lastStartedAt: startedAt,
        lastSucceededAt: succeededAt,
        lastFailedAt: failedAt,
        lastFailureCode: 'bell_retention_failed',
        monitoringStartedAt: expect.any(Date),
      }),
    ])
  })

  it('lists independently observed jobs in stable name order', async () => {
    await markCronJobSucceeded('subscriber-backup')
    await markCronJobSucceeded('suppression-sync')

    expect((await listCronJobHealth()).map((row) => row.jobName)).toEqual([
      'subscriber-backup',
      'suppression-sync',
    ])
  })
})
