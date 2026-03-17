import { checkBotId } from 'botid/server'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function POST(request: Request) {
  const { isBot } = await checkBotId()
  if (isBot) {
    console.warn('[verify] Bot blocked')
    return NextResponse.json(
      { error: 'Request blocked. Please try again from the website.' },
      { status: 403 }
    )
  }

  const { token } = await request.json()

  if (!token) {
    console.warn('[verify] Missing token')
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
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
        body: JSON.stringify({ token }),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      console.error(`[verify] Failed: ${res.status} ${data.error}`)
      return NextResponse.json(
        { error: data.error ?? 'Verification failed' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()

    // Mint JWT
    const secret = new TextEncoder().encode(siteConfig.jwtSecret)
    const jwt = await new SignJWT({
      sub: subscriber.uuid,
      email: subscriber.email,
      name: subscriber.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)

    const response = NextResponse.json({ subscriber })
    response.cookies.set('bp_token', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (err) {
    console.error('[verify] Network error:', err)
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}
