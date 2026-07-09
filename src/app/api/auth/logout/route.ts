import { NextResponse } from 'next/server'
import { clearSessionCookies, getSessionClaims } from '@/lib/auth/jwt'
import { revokeSubscriberSessions } from '@/lib/db/queries/subscribers'

export async function POST() {
  const session = await getSessionClaims()
  let revocationFailed = false
  if (session) {
    try {
      // A zero-row compare-and-swap means this token was already stale. It is
      // safe to clear locally without advancing the current session version.
      await revokeSubscriberSessions(session.uuid, session.sessionVersion)
    } catch (error) {
      revocationFailed = true
      console.error('[auth/logout] session revocation failed:', error)
    }
  }
  if (revocationFailed) {
    return NextResponse.json(
      { error: 'Could not revoke session' },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    )
  }

  const response = NextResponse.json({ ok: true })
  clearSessionCookies(response)
  return response
}
