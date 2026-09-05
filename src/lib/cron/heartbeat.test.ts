import { beforeEach, describe, expect, it, vi } from 'vitest'

const writes = vi.hoisted(() => ({
  started: vi.fn(),
  succeeded: vi.fn(),
  failed: vi.fn(),
}))

vi.mock('@/lib/db/queries/cron-job-health', () => ({
  markCronJobStarted: writes.started,
  markCronJobSucceeded: writes.succeeded,
  markCronJobFailed: writes.failed,
}))

import {
  recordCronFailed,
  recordCronStarted,
  recordCronSucceeded,
} from '@/lib/cron/heartbeat'

beforeEach(() => {
  vi.clearAllMocks()
  writes.started.mockResolvedValue(undefined)
  writes.succeeded.mockResolvedValue(undefined)
  writes.failed.mockResolvedValue(undefined)
})

describe('best-effort cron heartbeats', () => {
  it('writes lifecycle phases and the job-owned failure category', async () => {
    await recordCronStarted('suppression-sync')
    await recordCronSucceeded('suppression-sync')
    await recordCronFailed('suppression-sync')

    expect(writes.started).toHaveBeenCalledWith('suppression-sync')
    expect(writes.succeeded).toHaveBeenCalledWith('suppression-sync')
    expect(writes.failed).toHaveBeenCalledWith(
      'suppression-sync',
      'suppression_sync_failed'
    )
  })

  it('does not reject or log exception text when a diagnostic write fails', async () => {
    writes.succeeded.mockRejectedValueOnce(
      new Error('postgres://user:secret@example.test/private')
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(recordCronSucceeded('bell-retention')).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith(
      '[cron/bell-retention] succeeded heartbeat failed (Error)'
    )
    expect(log.mock.calls.flat().join(' ')).not.toContain('secret')
  })
})
