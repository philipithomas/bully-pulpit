import { type NextRequest, NextResponse } from 'next/server'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import { verifyToken } from '@/lib/auth/login-service'
import {
  applyNewsletterOptIns,
  normalizedNewsletters,
} from '@/lib/auth/subscriber-service'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  try {
    let subscriber = await verifyToken(token)
    subscriber = await applyNewsletterOptIns(
      subscriber,
      normalizedNewsletters(request.nextUrl.searchParams.getAll('newsletter'))
    )
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
