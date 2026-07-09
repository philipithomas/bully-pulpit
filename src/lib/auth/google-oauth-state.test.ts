import { NextResponse } from 'next/server'
import { describe, expect, it } from 'vitest'
import {
  clearGoogleOAuthStateCookie,
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  setGoogleOAuthStateCookie,
  verifyGoogleOAuthState,
} from '@/lib/auth/google-oauth-state'

describe('Google OAuth state', () => {
  it('mints unpredictable base64url state values', () => {
    const first = createGoogleOAuthState()
    const second = createGoogleOAuthState()
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(second).not.toBe(first)
  })

  it('requires an exact match to the HttpOnly cookie', () => {
    const request = new Request(
      'https://www.philipithomas.com/api/auth/google',
      {
        headers: { cookie: `${GOOGLE_OAUTH_STATE_COOKIE}=server-state` },
      }
    )
    expect(verifyGoogleOAuthState(request, 'server-state')).toBe(true)
    expect(verifyGoogleOAuthState(request, 'attacker-state')).toBe(false)
    expect(
      verifyGoogleOAuthState(
        new Request(request.url, { headers: { cookie: 'other=value' } }),
        'server-state'
      )
    ).toBe(false)
  })

  it('sets and expires a valid __Host- cookie', () => {
    const setResponse = NextResponse.json({ ok: true })
    setGoogleOAuthStateCookie(setResponse, 'server-state')
    const setCookie = setResponse.headers.getSetCookie()[0]
    expect(setCookie).toContain(`${GOOGLE_OAUTH_STATE_COOKIE}=server-state`)
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).not.toContain('Domain=')

    const clearResponse = NextResponse.json({ ok: true })
    clearGoogleOAuthStateCookie(clearResponse)
    const clearedCookie = clearResponse.headers.getSetCookie()[0]
    expect(clearedCookie).toContain(`${GOOGLE_OAUTH_STATE_COOKIE}=`)
    expect(clearedCookie).toContain('Max-Age=0')
  })
})
