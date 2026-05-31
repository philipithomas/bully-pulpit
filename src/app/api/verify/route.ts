import { NextResponse } from 'next/server'
import { setSessionCookies, signSession } from '@/lib/auth/jwt'
import { InvalidTokenError, verifyToken } from '@/lib/auth/login-service'
import { serializeSubscriber } from '@/lib/db/queries/subscribers'

export async function POST(request: Request) {
  const { token } = await request.json()

  if (!token) {
    console.warn('[verify] Missing token')
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  try {
    const subscriber = await verifyToken(token)
    const jwt = await signSession(subscriber)
    const response = NextResponse.json({
      subscriber: serializeSubscriber(subscriber),
    })
    setSessionCookies(response, jwt)
    return response
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 400 }
      )
    }
    console.error('[verify] error:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
