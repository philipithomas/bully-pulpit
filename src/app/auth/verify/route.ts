import { type NextRequest, NextResponse } from 'next/server'
import { summarizeNewsletters } from '@/lib/analytics/events'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import { verifyTokenWithMetadata } from '@/lib/auth/login-service'
import {
  applyNewsletterOptIns,
  normalizedNewsletters,
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
    subscriber = await applyNewsletterOptIns(
      subscriber,
      normalizedNewsletters(requestedNewsletters)
    )
    const jwt = await signSession(subscriber)
    // Track on the token-free landing page instead of from this request. The
    // server Analytics SDK derives its event URL from request context, which
    // would otherwise include the one-time magic token.
    const destination = new URL('/', request.url)
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
    return response
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid-token', request.url))
  }
}
