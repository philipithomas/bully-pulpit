import { describe, expect, it, vi } from 'vitest'
import {
  LOGOUT_FAILURE_MESSAGE,
  logoutAndClearClientSession,
} from '@/lib/auth/client-logout'

describe('logoutAndClearClientSession', () => {
  it('preserves client state when server-side revocation fails', async () => {
    const clearClientSession = vi.fn()
    const fetcher = vi.fn(async () =>
      Response.json({ error: 'Could not revoke session' }, { status: 503 })
    )

    await expect(
      logoutAndClearClientSession(clearClientSession, fetcher)
    ).rejects.toThrow(LOGOUT_FAILURE_MESSAGE)

    expect(clearClientSession).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('preserves client state when the logout request cannot complete', async () => {
    const clearClientSession = vi.fn()
    const fetcher = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(
      logoutAndClearClientSession(clearClientSession, fetcher)
    ).rejects.toThrow('fetch failed')
    expect(clearClientSession).not.toHaveBeenCalled()
  })

  it('clears client state after the server confirms logout', async () => {
    const clearClientSession = vi.fn()
    const fetcher = vi.fn(async () => Response.json({ ok: true }))

    await expect(
      logoutAndClearClientSession(clearClientSession, fetcher)
    ).resolves.toBeUndefined()
    expect(clearClientSession).toHaveBeenCalledOnce()
  })
})
