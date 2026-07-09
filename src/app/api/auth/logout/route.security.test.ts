import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth/jwt', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/auth/jwt')>()
  return { ...actual, getSessionClaims: vi.fn() }
})
vi.mock('@/lib/db/queries/subscribers', () => ({
  revokeSubscriberSessions: vi.fn(),
}))

import { POST } from '@/app/api/auth/logout/route'
import { getSessionClaims } from '@/lib/auth/jwt'
import { revokeSubscriberSessions } from '@/lib/db/queries/subscribers'

const session = {
  uuid: '123e4567-e89b-42d3-a456-426614174000',
  email: 'reader@example.com',
  name: null,
  sessionVersion: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSessionClaims).mockResolvedValue(session)
  vi.mocked(revokeSubscriberSessions).mockResolvedValue(true)
})

describe('POST /api/auth/logout revocation', () => {
  it('increments the subscriber session version before clearing cookies', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(revokeSubscriberSessions).toHaveBeenCalledWith(
      session.uuid,
      session.sessionVersion
    )
    expect(response.headers.getSetCookie()).toHaveLength(6)
  })

  it('treats an already-stale token as successfully logged out', async () => {
    vi.mocked(revokeSubscriberSessions).mockResolvedValueOnce(false)

    const response = await POST()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.getSetCookie()).toHaveLength(6)
  })

  it('retains every cookie and fails closed when the database is unavailable', async () => {
    vi.mocked(revokeSubscriberSessions).mockRejectedValueOnce(
      new Error('database unavailable')
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST()

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Could not revoke session' })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.getSetCookie()).toHaveLength(0)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
