import { checkBotId } from 'botid/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import { createOrRetrieve } from '@/lib/auth/subscriber-service'
import { siteConfig } from '@/lib/config'
import { serializeSubscriber } from '@/lib/db/queries/subscribers'
import { checkRateLimit } from '@/lib/rate-limit'

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
)

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { code } = body

  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code is required' },
      { status: 400 }
    )
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

    if (!email || !payload.email_verified) {
      return NextResponse.json(
        { error: 'Email not verified by Google' },
        { status: 400 }
      )
    }

    // Google-verified emails skip the OTP and are confirmed immediately.
    const { subscriber } = await createOrRetrieve({
      email,
      name: name || undefined,
      googleVerified: true,
    })

    const jwt = await signSession(subscriber)
    const response = NextResponse.json({
      user: serializeSubscriber(subscriber),
    })
    setSessionCookies(response, jwt)

    return response
  } catch (err) {
    console.error('[auth/google] Error:', err)
    return NextResponse.json(
      { error: 'Google authentication failed' },
      { status: 500 }
    )
  }
}
