import { checkBotId } from 'botid/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import {
  parseAnalyticsPlacement,
  summarizeNewsletters,
} from '@/lib/analytics/events'
import { trackServerEvent } from '@/lib/analytics/server'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import {
  createOrRetrieve,
  normalizedNewsletters,
} from '@/lib/auth/subscriber-service'
import { siteConfig } from '@/lib/config'
import { serializeSubscriber } from '@/lib/db/queries/subscribers'
import { PUBLIC_JSON_BODY_MAX_BYTES, readJsonBody } from '@/lib/http/json-body'
import { checkRateLimit } from '@/lib/rate-limit'

const googleAuthBodySchema = z.strictObject({
  code: z.string().max(4_096).optional(),
  // The email typed before opening the Google popup is deliberately ignored.
  // It remains an accepted legacy field so identity always comes from the
  // verified ID token without breaking an in-flight client.
  email: z.string().max(320).optional(),
  newsletters: z.array(z.string().max(32)).max(4).optional(),
  analytics_placement: z.string().max(100).optional(),
})

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
)

export async function POST(request: Request) {
  const parsedBody = await readJsonBody(
    request,
    googleAuthBodySchema,
    PUBLIC_JSON_BODY_MAX_BYTES
  )
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.error },
      { status: parsedBody.status }
    )
  }

  const { code, newsletters, analytics_placement } = parsedBody.data
  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code is required' },
      { status: 400 }
    )
  }

  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  if (!(await checkRateLimit('auth-google', `ip:${ip}`, request))) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: siteConfig.googleClientId,
        client_secret: siteConfig.googleClientSecret,
        redirect_uri: 'postmessage',
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      console.error(
        '[auth/google] Token exchange failed:',
        await tokenRes.text()
      )
      return NextResponse.json(
        { error: 'Google authentication failed' },
        { status: 400 }
      )
    }

    const tokens = await tokenRes.json()

    // Verify the ID token
    const { payload } = await jwtVerify(tokens.id_token, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: siteConfig.googleClientId,
    })

    const email = payload.email as string
    const name = payload.name as string | undefined
    const requestedNewsletters = normalizedNewsletters(newsletters)

    if (!email || !payload.email_verified) {
      return NextResponse.json(
        { error: 'Email not verified by Google' },
        { status: 400 }
      )
    }

    // Google-verified emails skip the OTP and are confirmed immediately.
    const result = await createOrRetrieve({
      email,
      name: name || undefined,
      googleVerified: true,
      newsletters: requestedNewsletters,
      allowExistingSubscriberOptIn: requestedNewsletters.length > 0,
    })
    const { subscriber, newlyConfirmed } = result

    const jwt = await signSession(subscriber)
    const response = NextResponse.json({
      user: serializeSubscriber(subscriber),
    })
    setSessionCookies(response, jwt)

    const placement = parseAnalyticsPlacement(analytics_placement)
    await Promise.all([
      trackServerEvent(request, 'Newsletter signup completed', {
        method: 'google',
        placement,
        newsletter: summarizeNewsletters(requestedNewsletters),
        new_subscriber: newlyConfirmed,
      }),
      ...(!newlyConfirmed
        ? result.changedNewsletters.map((newsletter) =>
            trackServerEvent(request, 'Newsletter preference changed', {
              placement,
              newsletter,
              subscribed: true,
            })
          )
        : []),
    ])

    return response
  } catch (err) {
    console.error('[auth/google] Error:', err)
    return NextResponse.json(
      { error: 'Google authentication failed' },
      { status: 500 }
    )
  }
}
