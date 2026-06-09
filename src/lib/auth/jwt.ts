import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

const TOKEN_COOKIE = 'bp_token'
const SESSION_FLAG_COOKIE = 'bp_has_session'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export type Session = { uuid: string; email: string; name: string | null }

function secret(): Uint8Array {
  return new TextEncoder().encode(siteConfig.jwtSecret)
}

export async function signSession(subscriber: {
  uuid: string
  email: string
  name: string | null
}): Promise<string> {
  return new SignJWT({ email: subscriber.email, name: subscriber.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subscriber.uuid)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret())
}

/** Reads and verifies the session cookie. Returns null if absent or invalid. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ['HS256'],
    })
    return {
      uuid: payload.sub as string,
      email: payload.email as string,
      name: (payload.name as string | null) ?? null,
    }
  } catch {
    return null
  }
}

export function setSessionCookies(response: NextResponse, jwt: string): void {
  const secure = process.env.NODE_ENV === 'production'
  response.cookies.set(TOKEN_COOKIE, jwt, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
  response.cookies.set(SESSION_FLAG_COOKIE, '1', {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(TOKEN_COOKIE)
  response.cookies.delete(SESSION_FLAG_COOKIE)
}
