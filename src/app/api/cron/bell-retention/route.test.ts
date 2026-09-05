import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const heartbeat = vi.hoisted(() => ({
  started: vi.fn(),
  succeeded: vi.fn(),
  failed: vi.fn(),
}))

vi.mock('@/lib/cron/heartbeat', () => ({
  recordCronStarted: heartbeat.started,
  recordCronSucceeded: heartbeat.succeeded,
  recordCronFailed: heartbeat.failed,
}))

vi.mock('@/lib/db/queries/bell-conversations', () => ({
  purgeExpiredBellConversations: vi.fn(),
}))

import { GET } from '@/app/api/cron/bell-retention/route'
import { purgeExpiredBellConversations } from '@/lib/db/queries/bell-conversations'

const mockedPurge = vi.mocked(purgeExpiredBellConversations)

function request(auth?: string) {
  return new Request('http://localhost/api/cron/bell-retention', {
    headers: auth ? { authorization: auth } : undefined,
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  vi.clearAllMocks()
  heartbeat.started.mockResolvedValue(undefined)
  heartbeat.succeeded.mockResolvedValue(undefined)
  heartbeat.failed.mockResolvedValue(undefined)
  mockedPurge.mockReset()
  mockedPurge.mockResolvedValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET Bell retention cleanup', () => {
  it('requires the cron bearer token', async () => {
    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mockedPurge).not.toHaveBeenCalled()
    expect(heartbeat.started).not.toHaveBeenCalled()
  })

  it('deletes expired web conversations', async () => {
    mockedPurge.mockResolvedValue(3)

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: 3 })
    expect(mockedPurge).toHaveBeenCalledOnce()
    expect(heartbeat.started).toHaveBeenCalledWith('bell-retention')
    expect(heartbeat.succeeded).toHaveBeenCalledWith('bell-retention')
    expect(heartbeat.failed).not.toHaveBeenCalled()
  })

  it('reports cleanup failures without exposing details', async () => {
    mockedPurge.mockRejectedValue(new Error('database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Retention cleanup failed' })
    expect(heartbeat.failed).toHaveBeenCalledWith('bell-retention')
    expect(heartbeat.succeeded).not.toHaveBeenCalled()
  })
})
