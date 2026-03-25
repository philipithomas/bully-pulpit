import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const body = await request.json()
  const { email, code } = body

  if (!email || !code) {
    return NextResponse.json(
      { error: 'Email and code are required' },
      { status: 400 }
    )
  }

  // Rate limit: 5 attempts per email per 15 minutes
  const emailKey = `verify:${email.toLowerCase()}`
  if (!checkRateLimit(emailKey, 5, 15 * 60 * 1000)) {
    console.warn(`[auth/verify] Rate limited: ${emailKey}`)
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      { status: 429 }
    )
  }

  try {
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': siteConfig.m2mApiKey,
        },
        body: JSON.stringify({ token: code, email }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      console.error(`[auth/verify] Failed: ${res.status} ${data.error}`)
      // Only pass through expected client-facing messages
      const safeErrors: Record<number, string> = {
        400: 'Invalid or expired code',
        404: 'Account not found',
      }
      return NextResponse.json(
        { error: safeErrors[res.status] ?? 'Verification failed' },
        { status: res.status }
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
    console.error('[auth/verify] Network error:', err)
    return NextResponse.json(
      { error: 'Unable to reach verification service' },
      { status: 502 }
    )
  }
}
