import { type NextRequest, NextResponse } from 'next/server'
import { summarizeNewsletters } from '@/lib/analytics/events'
import {
  setNewSubscriberOnboardingCookie,
  setSessionCookies,
  signSession,
} from '@/lib/auth/jwt'
import { verifyTokenWithMetadata } from '@/lib/auth/login-service'
import {
  applyNewsletterOptIns,
  normalizedNewsletters,
  notifyExistingSubscriberOptIns,
} from '@/lib/auth/subscriber-service'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  try {
    const verification = await verifyTokenWithMetadata(token)
    let subscriber = verification.subscriber
    const requestedNewsletters =
      request.nextUrl.searchParams.getAll('newsletter')
    const newsletters = normalizedNewsletters(requestedNewsletters)
    const beforeOptIns = subscriber
    subscriber = await applyNewsletterOptIns(subscriber, newsletters)
    await notifyExistingSubscriberOptIns(
      beforeOptIns,
      subscriber,
      !verification.newlyConfirmed
    )
    const jwt = await signSession(subscriber)
    // Track on the token-free landing page instead of from this request. The
    // server Analytics SDK derives its event URL from request context, which
    // would otherwise include the one-time magic token.
    const destination = new URL(
      newsletters.includes('umami') ? '/account' : '/',
      request.url
    )
    destination.searchParams.set('signed-in', '1')
    destination.searchParams.set('analytics-signup', 'email-link')
    destination.searchParams.set(
      'analytics-newsletter',
      summarizeNewsletters(requestedNewsletters)
    )
    destination.searchParams.set(
      'analytics-new-subscriber',
      verification.newlyConfirmed ? '1' : '0'
    )
    const response = NextResponse.redirect(destination)
    setSessionCookies(response, jwt)
    await setNewSubscriberOnboardingCookie(
      response,
      subscriber,
      verification.newlyConfirmed
    )
    return response
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid-token', request.url))
  }
}
