import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth/admin'
import { clearSessionCookies, getSession } from '@/lib/auth/jwt'
import {
  findByUuid,
  serializeSubscriberPreferences,
} from '@/lib/db/queries/subscribers'

export async function GET() {
  const session = await getSession()

  if (session) {
    const subscriber = await findByUuid(session.uuid)
    if (!subscriber) {
      const response = NextResponse.json({ user: null, preferences: null })
      clearSessionCookies(response)
      return response
    }

    return NextResponse.json({
      user: {
        uuid: subscriber.uuid,
        email: subscriber.email,
        name: subscriber.name,
        isAdmin: isAdmin(subscriber.email),
      },
      preferences: serializeSubscriberPreferences(subscriber),
    })
  }

  // No valid session. If a stale/invalid bp_token cookie is present, clear it so
  // the client stops re-fetching /api/auth/me on every load (self-healing).
  const response = NextResponse.json({ user: null, preferences: null })
  const store = await cookies()
  if (store.get('bp_token')) {
    clearSessionCookies(response)
  }
  return response
}
