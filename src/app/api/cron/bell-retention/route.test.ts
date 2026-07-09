import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  })

  it('deletes expired web conversations', async () => {
    mockedPurge.mockResolvedValue(3)

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: 3 })
    expect(mockedPurge).toHaveBeenCalledOnce()
  })

  it('reports cleanup failures without exposing details', async () => {
    mockedPurge.mockRejectedValue(new Error('database unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(request('Bearer test-cron-secret'))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Retention cleanup failed' })
  })
})
