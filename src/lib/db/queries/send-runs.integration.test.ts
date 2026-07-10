import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import {
  allLatestRunIds,
  deleteSendRunIfMatches,
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
