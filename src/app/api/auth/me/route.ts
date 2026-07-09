import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth/admin'
import {
  clearNewSubscriberOnboardingCookie,
  clearSessionCookies,
  getSession,
  NEW_SUBSCRIBER_ONBOARDING_COOKIE,
  verifyNewSubscriberOnboardingCookie,
} from '@/lib/auth/jwt'
import {
  findByUuid,
  serializeSubscriberPreferences,
} from '@/lib/db/queries/subscribers'

export async function GET(request: Request) {
  const store = await cookies()
  const session = await getSession()
  const shouldConsumeOnboarding =
    new URL(request.url).searchParams.get('consume_onboarding') === '1'

  if (session) {
    const subscriber = await findByUuid(session.uuid)
    if (!subscriber) {
      const response = NextResponse.json({
        user: null,
        preferences: null,
        newSubscriberOnboarding: false,
      })
      clearSessionCookies(response)
      return response
    }

    // Some surfaces poll this route only to detect a newly shared session. Do
    // not let those background checks consume the one-time onboarding marker.
    const marker = shouldConsumeOnboarding
      ? store.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)?.value
      : undefined
    const newSubscriberOnboarding = marker
      ? await verifyNewSubscriberOnboardingCookie(marker, subscriber.uuid)
      : false
    const response = NextResponse.json({
      user: {
        uuid: subscriber.uuid,
        email: subscriber.email,
        name: subscriber.name,
        isAdmin: isAdmin(subscriber.email),
      },
      preferences: serializeSubscriberPreferences(subscriber),
      newSubscriberOnboarding,
    })
    if (marker) clearNewSubscriberOnboardingCookie(response)
    return response
  }

  // No valid session. If a stale/invalid bp_token cookie is present, clear it so
  // the client stops re-fetching /api/auth/me on every load (self-healing).
  const response = NextResponse.json({
    user: null,
    preferences: null,
    newSubscriberOnboarding: false,
  })
  if (store.get('bp_token') || store.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE)) {
    clearSessionCookies(response)
  }
  return response
}
