import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => import('@/test/integration/session'))

import { POST } from '@/app/api/auth/logout/route'
import { clearSessionStore } from '@/test/integration/session'

beforeEach(() => {
  clearSessionStore()
})

describe('POST /api/auth/logout', () => {
  it('clears the session and onboarding cookies', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(
      response.headers
        .getSetCookie()
        .map((cookie) => cookie.split('=')[0])
        .sort()
    ).toEqual([
      '__Host-bp_has_session',
      '__Host-bp_onboarding',
      '__Host-bp_token',
      'bp_has_session',
      'bp_onboarding',
      'bp_token',
    ])
  })
})
