import { beforeEach, describe, expect, it, vi } from 'vitest'

const heartbeat = vi.hoisted(() => ({
  started: vi.fn(),
  succeeded: vi.fn(),
  failed: vi.fn(),
}))
const suppressions = vi.hoisted(() => ({
  list: vi.fn(),
  upsert: vi.fn(),
  removeAbsent: vi.fn(),
}))

vi.mock('@/lib/cron/heartbeat', () => ({
  recordCronStarted: heartbeat.started,
  recordCronSucceeded: heartbeat.succeeded,
  recordCronFailed: heartbeat.failed,
}))
vi.mock('@/lib/email/ses', () => ({
  listSuppressedDestinations: suppressions.list,
}))
vi.mock('@/lib/db/queries/suppressions', () => ({
  upsertSuppression: suppressions.upsert,
  deleteBySourceNotIn: suppressions.removeAbsent,
}))

import { GET } from '@/app/api/cron/suppression-sync/route'

function request(auth?: string) {
  return new Request('http://localhost/api/cron/suppression-sync', {
    headers: auth ? { authorization: auth } : undefined,
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  vi.clearAllMocks()
  heartbeat.started.mockResolvedValue(undefined)
  heartbeat.succeeded.mockResolvedValue(undefined)
  heartbeat.failed.mockResolvedValue(undefined)
  suppressions.list.mockResolvedValue([
    { email: 'bounce@example.com', reason: 'BOUNCE' },
  ])
  suppressions.upsert.mockResolvedValue(undefined)
  suppressions.removeAbsent.mockResolvedValue(2)
})

describe('GET suppression sync', () => {
  it('does not heartbeat an unauthorized request', async () => {
    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(heartbeat.started).not.toHaveBeenCalled()
  })

  it('records start and success around the authoritative sync', async () => {
    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ synced: 1, removed: 2 })
    expect(heartbeat.started).toHaveBeenCalledWith('suppression-sync')
    expect(heartbeat.succeeded).toHaveBeenCalledWith('suppression-sync')
    expect(heartbeat.failed).not.toHaveBeenCalled()
  })

  it('records failure while preserving the route failure contract', async () => {
    suppressions.list.mockRejectedValue(new Error('SES unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Sync failed' })
    expect(heartbeat.failed).toHaveBeenCalledWith('suppression-sync')
    expect(heartbeat.succeeded).not.toHaveBeenCalled()
  })
})
