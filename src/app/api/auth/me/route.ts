import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/auth/admin'
import {
  clearNewSubscriberOnboardingCookie,
  clearSessionCookies,
  getVerifiedSession,
  LEGACY_NEW_SUBSCRIBER_ONBOARDING_COOKIE,
  LEGACY_TOKEN_COOKIE,
  NEW_SUBSCRIBER_ONBOARDING_COOKIE,
  TOKEN_COOKIE,
  verifyNewSubscriberOnboardingCookie,
} from '@/lib/auth/jwt'
import { serializeSubscriberPreferences } from '@/lib/db/queries/subscribers'

export async function GET(request: Request) {
  const store = await cookies()
  const verified = await getVerifiedSession()
  const shouldConsumeOnboarding =
    new URL(request.url).searchParams.get('consume_onboarding') === '1'

  if (verified) {
    const { subscriber } = verified

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

  // No valid session. If a stale/invalid session cookie is present, clear it so
  // the client stops re-fetching /api/auth/me on every load (self-healing).
  const response = NextResponse.json({
    user: null,
    preferences: null,
    newSubscriberOnboarding: false,
  })
  if (
    store.get(TOKEN_COOKIE) ||
    store.get(LEGACY_TOKEN_COOKIE) ||
    store.get(NEW_SUBSCRIBER_ONBOARDING_COOKIE) ||
    store.get(LEGACY_NEW_SUBSCRIBER_ONBOARDING_COOKIE)
  ) {
    clearSessionCookies(response)
  }
  return response
}
