import { checkBotId } from 'botid/server'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
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
import { PUBLIC_JSON_BODY_MAX_BYTES, readJsonBody } from '@/lib/http/json-body'
import { checkRateLimit } from '@/lib/rate-limit'

const verifyBodySchema = z.strictObject({
  email: z.string().max(320).optional(),
  code: z.string().max(2_048).optional(),
  newsletters: z.array(z.string().max(32)).max(4).optional(),
  analytics_placement: z.string().max(100).optional(),
})

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(
    request,
    verifyBodySchema,
    PUBLIC_JSON_BODY_MAX_BYTES
  )
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.status }
    )
  }

  const { email, code, newsletters, analytics_placement } = parsedBody.data
  if (!email || !code) {
    return NextResponse.json(
      { error: 'Email and code are required' },
      { status: 400 }
    )
  }

  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
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
      normalizedNewsletters(newsletters)
    )
    const jwt = await signSession(subscriber)
    const response = NextResponse.json({
      user: serializeSubscriber(subscriber),
    })
    setSessionCookies(response, jwt)
    await trackServerEvent(request, 'Newsletter signup completed', {
      method: 'email_code',
      placement: parseAnalyticsPlacement(analytics_placement),
      newsletter: summarizeNewsletters(newsletters),
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
