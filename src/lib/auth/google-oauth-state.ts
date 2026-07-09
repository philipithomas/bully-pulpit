import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextResponse } from 'next/server'

export const GOOGLE_OAUTH_STATE_COOKIE = '__Host-bp_google_state'
const STATE_MAX_AGE_SECONDS = 10 * 60
const STATE_BYTES = 32

export function createGoogleOAuthState(): string {
  return randomBytes(STATE_BYTES).toString('base64url')
}

export function setGoogleOAuthStateCookie(
  response: NextResponse,
  state: string
): void {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearGoogleOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}

function requestCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

/** Constant-time double-submit check against the server-issued HttpOnly state. */
export function verifyGoogleOAuthState(
  request: Request,
  suppliedState: string | undefined
): boolean {
  const expectedState = requestCookie(request, GOOGLE_OAUTH_STATE_COOKIE)
  if (!expectedState || !suppliedState) return false
  const expected = Buffer.from(expectedState)
  const supplied = Buffer.from(suppliedState)
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  )
}
