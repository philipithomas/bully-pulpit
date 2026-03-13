import { SignJWT } from 'jose'
import { type NextRequest, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
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
      }
    )

    if (!res.ok) {
      return NextResponse.redirect(
        new URL('/?error=invalid-token', request.url)
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

    const response = NextResponse.redirect(new URL('/', request.url))
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
    return NextResponse.redirect(new URL('/?error=verify-failed', request.url))
  }
}
