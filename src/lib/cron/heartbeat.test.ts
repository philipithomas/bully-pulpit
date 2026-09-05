import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

afterEach(() => {
  vi.useRealTimers()
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

  it('stops awaiting a slow write and consumes its eventual rejection', async () => {
    vi.useFakeTimers()
    let rejectWrite: ((reason?: unknown) => void) | undefined
    const slowWrite = new Promise<void>((_resolve, reject) => {
      rejectWrite = reject
    })
    writes.started.mockReturnValueOnce(slowWrite)
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    try {
      const heartbeat = recordCronStarted('subscriber-backup')
      await vi.advanceTimersByTimeAsync(1_000)
      await expect(heartbeat).resolves.toBeUndefined()
      expect(log).toHaveBeenCalledWith(
        '[cron/subscriber-backup] started heartbeat timed out'
      )

      rejectWrite?.(new Error('late database rejection'))
      await Promise.resolve()
      await Promise.resolve()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
