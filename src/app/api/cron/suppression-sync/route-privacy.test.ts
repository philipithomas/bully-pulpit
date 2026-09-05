import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/queries/suppressions', () => ({
  deleteBySourceNotIn: vi.fn(),
  upsertSuppression: vi.fn(),
}))
vi.mock('@/lib/email/ses', () => ({
  listSuppressedDestinations: vi.fn(),
}))

import { GET } from '@/app/api/cron/suppression-sync/route'
import {
  deleteBySourceNotIn,
  upsertSuppression,
} from '@/lib/db/queries/suppressions'
import { listSuppressedDestinations } from '@/lib/email/ses'

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-cron-secret')
  vi.mocked(listSuppressedDestinations)
    .mockReset()
    .mockResolvedValue([{ email: 'reader@example.com', reason: 'BOUNCE' }])
  vi.mocked(upsertSuppression).mockReset().mockResolvedValue(undefined)
  vi.mocked(deleteBySourceNotIn).mockReset().mockResolvedValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('suppression sync failure logging', () => {
  it.each([
    ['list', listSuppressedDestinations],
    ['upsert', upsertSuppression],
    ['prune', deleteBySourceNotIn],
  ] as const)('logs only the operation when %s fails', async (operation, fail) => {
    const error = Object.assign(
      new Error('Failed query: insert into email_suppressions'),
      {
        params: ['reader@example.com'],
        cause: new Error('provider connection string and credentials'),
      }
    )
    vi.mocked(fail).mockRejectedValueOnce(error)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(
      new Request('http://localhost/api/cron/suppression-sync', {
        headers: { authorization: 'Bearer test-cron-secret' },
      })
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Sync failed' })
    expect(log.mock.calls).toEqual([
      ['[cron/suppression-sync] failed:', { operation }],
    ])
    if (operation !== 'prune') {
      expect(deleteBySourceNotIn).not.toHaveBeenCalled()
    }
  })
})
