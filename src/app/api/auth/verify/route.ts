import { checkBotId } from 'botid/server'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    console.warn('[auth/verify] Bot blocked')
    return NextResponse.json(
      { error: 'Request blocked. Please try again from the website.' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { email, code } = body

  if (!email || !code) {
    console.warn('[auth/verify] Missing email or code')
    return NextResponse.json(
      { error: 'Email and code are required' },
      { status: 400 }
    )
  }

  console.log(`[auth/verify] Verifying code for ${email}`)

  try {
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': siteConfig.m2mApiKey,
        },
        body: JSON.stringify({ email, token: code }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      console.error(
        `[auth/verify] Failed for ${email}: ${res.status} ${data.error}`
      )
      return NextResponse.json(
        { error: data.error ?? 'Verification failed' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()
    console.log(
      `[auth/verify] Verified: ${subscriber.email} (uuid=${subscriber.uuid})`
    )

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
    console.error(`[auth/verify] Network error for ${email}:`, err)
    return NextResponse.json(
      { error: 'Unable to reach verification service' },
      { status: 502 }
    )
  }
}
