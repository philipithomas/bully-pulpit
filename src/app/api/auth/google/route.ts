import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function POST(request: Request) {
  const { credential } = await request.json()

  if (!credential) {
    return NextResponse.json(
      { error: 'Google credential is required' },
      { status: 400 }
    )
  }

  // Verify the Google ID token via Google's tokeninfo endpoint
  let googleUser: { email?: string; name?: string; aud?: string }
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    )
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Invalid Google credential' },
        { status: 401 }
      )
    }
    googleUser = await res.json()
  } catch {
    return NextResponse.json(
      { error: 'Failed to verify Google credential' },
      { status: 401 }
    )
  }

  if (!googleUser.email) {
    return NextResponse.json(
      { error: 'No email in Google credential' },
      { status: 400 }
    )
  }

  // Verify audience matches our client ID
  if (
    siteConfig.googleClientId &&
    googleUser.aud !== siteConfig.googleClientId
  ) {
    return NextResponse.json(
      { error: 'Token audience mismatch' },
      { status: 401 }
    )
  }

  // Create subscriber in printing-press with google_verified: true
  try {
    const subRes = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': siteConfig.m2mApiKey,
        },
        body: JSON.stringify({
          email: googleUser.email,
          name: googleUser.name,
          google_verified: true,
        }),
      }
    )

    if (!subRes.ok) {
      const data = await subRes.json()
      return NextResponse.json(
        { error: data.error ?? 'Subscription failed' },
        { status: subRes.status }
      )
    }

    const subscriber = await subRes.json()

    // Mint JWT directly — no 6-digit code needed for Google-verified users
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
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}
