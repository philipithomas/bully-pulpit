import { type NextRequest, NextResponse } from 'next/server'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import { verifyToken } from '@/lib/auth/login-service'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  try {
    const subscriber = await verifyToken(token)
    const jwt = await signSession(subscriber)
    const response = NextResponse.redirect(
      new URL('/?signed-in=1', request.url)
    )
    setSessionCookies(response, jwt)
    return response
  } catch {
    return NextResponse.redirect(new URL('/?error=invalid-token', request.url))
  }
}
