import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { checkRateLimit } from '@/lib/rate-limit'

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
)

export async function POST(request: Request) {
  const { code } = await request.json()

  if (!code) {
    return NextResponse.json(
      { error: 'Authorization code is required' },
      { status: 400 }
    )
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  if (!checkRateLimit(`google-auth:${ip}`, 10, 15 * 60 * 1000)) {
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

    // Create or find subscriber in printing-press.
    // google_verified: true tells printing-press to skip the OTP
    // email and mark the subscriber as confirmed immediately.
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': siteConfig.m2mApiKey,
        },
        body: JSON.stringify({
          email,
          name: name || undefined,
          google_verified: true,
        }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      console.error(`[auth/google] Backend error: ${res.status}`, data)
      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      )
    }

    const subscriber = await res.json()

    const secret = new TextEncoder().encode(siteConfig.jwtSecret)
    const jwt = await new SignJWT({
      email: subscriber.email,
      name: subscriber.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(subscriber.uuid)
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    const response = NextResponse.json({ user: subscriber })
    response.cookies.set('bp_token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    response.cookies.set('bp_has_session', '1', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[auth/google] Error:', err)
    return NextResponse.json(
      { error: 'Google authentication failed' },
      { status: 500 }
    )
  }
}
