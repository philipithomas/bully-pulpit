import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import {
  parseAnalyticsPlacement,
  summarizeNewsletters,
} from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import {
  InvalidTokenError,
  verifyTokenWithMetadata,
} from '@/lib/auth/login-service'
import {
  applyNewsletterOptIns,
  normalizedNewsletters,
} from '@/lib/auth/subscriber-service'
import { serializeSubscriber } from '@/lib/db/queries/subscribers'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { email, code, newsletters, analytics_placement } = body

  if (!email || !code) {
    return NextResponse.json(
      { error: 'Email and code are required' },
      { status: 400 }
    )
  }

  // Rate limit: 5 attempts per email per 15 minutes
  const emailKey = `email:${email.toLowerCase()}`
  if (!(await checkRateLimit('auth-verify', emailKey, request))) {
    console.warn(`[auth/verify] Rate limited: ${emailKey}`)
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const verification = await verifyTokenWithMetadata(code, email)
    let subscriber = verification.subscriber
    subscriber = await applyNewsletterOptIns(
      subscriber,
      normalizedNewsletters(
        Array.isArray(newsletters) ? newsletters : undefined
      )
    )
    const jwt = await signSession(subscriber)
    const response = NextResponse.json({
      user: serializeSubscriber(subscriber),
    })
    setSessionCookies(response, jwt)
    await trackServerEvent(request, 'Newsletter signup completed', {
      method: 'email_code',
      placement: parseAnalyticsPlacement(analytics_placement),
      newsletter: summarizeNewsletters(
        Array.isArray(newsletters) ? newsletters : undefined
      ),
      new_subscriber: verification.newlyConfirmed,
    })
    return response
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 400 }
      )
    }
    console.error('[auth/verify] error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
