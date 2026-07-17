import { type NextRequest, NextResponse } from 'next/server'
import { summarizeNewsletters } from '@/lib/analytics/events'
import {
  setNewSubscriberOnboardingCookie,
  setSessionCookies,
  signSession,
} from '@/lib/auth/jwt'
import { verifyTokenWithMetadata } from '@/lib/auth/login-service'
import { setMagicLinkCompletionCookie } from '@/lib/auth/magic-link-completion'
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
    const isUmamiSignup = newsletters.includes('umami')
    // Complete analytics on a second, query-free request. Vercel's server SDK
    // prefers the platform request context, so passing this token-bearing
    // request directly would expose the magic token as the event URL.
    const response = NextResponse.redirect(
      new URL('/auth/complete', request.url)
    )
    setSessionCookies(response, jwt)
    await setMagicLinkCompletionCookie(response, {
      newsletter: summarizeNewsletters(requestedNewsletters),
      newSubscriber: verification.newlyConfirmed,
      destination: isUmamiSignup ? 'account' : 'home',
    })
    await setNewSubscriberOnboardingCookie(
      response,
      subscriber,
      verification.newlyConfirmed
    )
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid-token', request.url))
  }
}
