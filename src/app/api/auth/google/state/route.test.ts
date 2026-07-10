import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/auth/google/state/route'
import { GOOGLE_OAUTH_STATE_COOKIE } from '@/lib/auth/google-oauth-state'

describe('POST /api/auth/google/state', () => {
  it('binds a fresh state value to an HttpOnly no-store cookie', async () => {
    const response = await POST()
    const { state } = (await response.json()) as { state: string }
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value).toBe(state)
    const setCookie = response.headers.getSetCookie().join('; ')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('Path=/')
  })
})
