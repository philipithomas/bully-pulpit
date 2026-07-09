import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

const TOKEN_COOKIE = 'bp_token'
const SESSION_FLAG_COOKIE = 'bp_has_session'
export const NEW_SUBSCRIBER_ONBOARDING_COOKIE = 'bp_onboarding'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days
const ONBOARDING_MAX_AGE_SECONDS = 60 * 15
const ONBOARDING_PURPOSE = 'new-subscriber-onboarding'

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

async function signNewSubscriberOnboarding(subscriber: {
  uuid: string
}): Promise<string> {
  return new SignJWT({ purpose: ONBOARDING_PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subscriber.uuid)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret())
}

export async function verifyNewSubscriberOnboardingCookie(
  marker: string,
  subscriberUuid: string
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(marker, secret(), {
      algorithms: ['HS256'],
    })
    return (
      payload.sub === subscriberUuid && payload.purpose === ONBOARDING_PURPOSE
    )
  } catch {
    return false
  }
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

export function clearNewSubscriberOnboardingCookie(
  response: NextResponse
): void {
  response.cookies.delete(NEW_SUBSCRIBER_ONBOARDING_COOKIE)
}

export async function setNewSubscriberOnboardingCookie(
  response: NextResponse,
  subscriber: { uuid: string },
  newlyConfirmed: boolean
): Promise<void> {
  // A signup mints separate code and magic-link tokens. Completing the second
  // valid token must not clear the fresh marker issued by the first. Explicit
  // consumption, logout, and subscriber-bound verification own cleanup.
  if (!newlyConfirmed) return

  response.cookies.set(
    NEW_SUBSCRIBER_ONBOARDING_COOKIE,
    await signNewSubscriberOnboarding(subscriber),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ONBOARDING_MAX_AGE_SECONDS,
      path: '/',
    }
  )
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.delete(TOKEN_COOKIE)
  response.cookies.delete(SESSION_FLAG_COOKIE)
  clearNewSubscriberOnboardingCookie(response)
}
