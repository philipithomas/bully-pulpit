import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  allLatestRunIds,
  allLatestRuns,
  deleteSendRunIfMatches,
  latestRunBySlug,
  latestRunIdBySlug,
  recordSendRun,
} from '@/lib/db/queries/send-runs'
import { resetDb } from '@/test/integration/db'

beforeEach(resetDb)

describe('send run records', () => {
  it('keeps only the latest run id for each post', async () => {
    await recordSendRun('alpha', 'alpha-old')
    await recordSendRun('beta', 'beta-run')
    await recordSendRun('alpha', 'alpha-new')

    await expect(allLatestRunIds()).resolves.toEqual({
      alpha: 'alpha-new',
      beta: 'beta-run',
    })

    const runs = await allLatestRuns()
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          postSlug: 'alpha',
          runId: 'alpha-new',
          startedAt: expect.any(Date),
        }),
        expect.objectContaining({
          postSlug: 'beta',
          runId: 'beta-run',
          startedAt: expect.any(Date),
        }),
      ])
    )
    expect(runs).toHaveLength(2)
    await expect(latestRunBySlug('alpha')).resolves.toEqual(
      expect.objectContaining({
        postSlug: 'alpha',
        runId: 'alpha-new',
        startedAt: expect.any(Date),
      })
    )
  })

  it('cannot delete a newer run using an old status probe', async () => {
    await recordSendRun('alpha', 'alpha-old')
    await recordSendRun('alpha', 'alpha-new')

    await expect(deleteSendRunIfMatches('alpha', 'alpha-old')).resolves.toBe(
      false
    )
    await expect(latestRunIdBySlug('alpha')).resolves.toBe('alpha-new')

    await expect(deleteSendRunIfMatches('alpha', 'alpha-new')).resolves.toBe(
      true
    )
    await expect(latestRunIdBySlug('alpha')).resolves.toBeNull()
  })
})
