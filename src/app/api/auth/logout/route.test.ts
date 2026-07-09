import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/auth/logout/route'

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
    ).toEqual(['bp_has_session', 'bp_onboarding', 'bp_token'])
  })
})
