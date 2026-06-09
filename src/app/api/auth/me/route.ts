import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth/admin'
import { clearSessionCookies, getSession } from '@/lib/auth/jwt'

export async function GET() {
  const session = await getSession()

  if (session) {
    return NextResponse.json({
      user: {
        uuid: session.uuid,
        email: session.email,
        name: session.name,
        isAdmin: isAdmin(session.email),
      },
    })
  }

  // No valid session. If a stale/invalid bp_token cookie is present, clear it so
  // the client stops re-fetching /api/auth/me on every load (self-healing).
  const response = NextResponse.json({ user: null })
  const store = await cookies()
  if (store.get('bp_token')) {
    clearSessionCookies(response)
  }
  return response
}
