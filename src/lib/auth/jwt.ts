import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { findByUuid } from '@/lib/db/queries/subscribers'
import type { Subscriber } from '@/lib/db/schema'

export const TOKEN_COOKIE = '__Host-bp_token'
export const SESSION_FLAG_COOKIE = '__Host-bp_has_session'
export const NEW_SUBSCRIBER_ONBOARDING_COOKIE = '__Host-bp_onboarding'
export const LEGACY_TOKEN_COOKIE = 'bp_token'
export const LEGACY_SESSION_FLAG_COOKIE = 'bp_has_session'
export const LEGACY_NEW_SUBSCRIBER_ONBOARDING_COOKIE = 'bp_onboarding'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days
const ONBOARDING_MAX_AGE_SECONDS = 60 * 15
const SESSION_ISSUER = 'https://www.philipithomas.com'
const SESSION_AUDIENCE = 'philipithomas.com:subscriber-session'
const ONBOARDING_AUDIENCE = 'philipithomas.com:new-subscriber-onboarding'
const ONBOARDING_PURPOSE = 'new-subscriber-onboarding'

export type Session = {
  uuid: string
  email: string
  name: string | null
  sessionVersion: number
}

function secret(): Uint8Array {
  return new TextEncoder().encode(siteConfig.jwtSecret)
}

export async function signSession(subscriber: {
  uuid: string
  email: string
  name: string | null
  sessionVersion: number
}): Promise<string> {
  return new SignJWT({
    email: subscriber.email,
    name: subscriber.name,
    sessionVersion: subscriber.sessionVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subscriber.uuid)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
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
    .setIssuer(SESSION_ISSUER)
    .setAudience(ONBOARDING_AUDIENCE)
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
      issuer: SESSION_ISSUER,
      audience: ONBOARDING_AUDIENCE,
    })
    return (
      payload.sub === subscriberUuid && payload.purpose === ONBOARDING_PURPOSE
    )
  } catch {
    return false
  }
}

export type VerifiedSession = {
  session: Session
  subscriber: Subscriber
}

/**
 * Verifies token integrity and scope without consulting subscriber state.
 * Logout uses this so a database outage cannot turn a valid token into an
 * anonymous request and silently skip the revocation attempt.
 */
export async function getSessionClaims(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(TOKEN_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    })
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.sessionVersion !== 'number' ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      payload.sessionVersion < 1
    ) {
      return null
    }
    return {
      uuid: payload.sub,
      email: payload.email.toLowerCase(),
      name: typeof payload.name === 'string' ? payload.name : null,
      sessionVersion: payload.sessionVersion,
    }
  } catch {
    return null
  }
}

/**
 * Verifies the cookie and current subscriber row together. Callers that need
 * preferences can reuse the row instead of performing a second lookup.
 */
export async function getVerifiedSession(): Promise<VerifiedSession | null> {
  const claims = await getSessionClaims()
  if (!claims) return null
  try {
    const subscriber = await findByUuid(claims.uuid)
    if (
      !subscriber?.confirmedAt ||
      subscriber.email !== claims.email ||
      subscriber.sessionVersion !== claims.sessionVersion
    ) {
      return null
    }
    return {
      session: {
        uuid: subscriber.uuid,
        email: subscriber.email,
        name: subscriber.name,
        sessionVersion: subscriber.sessionVersion,
      },
      subscriber,
    }
  } catch {
    return null
  }
}

/** Reads and verifies the session cookie. Returns null if absent or invalid. */
export async function getSession(): Promise<Session | null> {
  return (await getVerifiedSession())?.session ?? null
}

export function setSessionCookies(response: NextResponse, jwt: string): void {
  response.cookies.set(TOKEN_COOKIE, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
  response.cookies.set(SESSION_FLAG_COOKIE, '1', {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
  expireCookie(response, LEGACY_TOKEN_COOKIE, true)
  expireCookie(response, LEGACY_SESSION_FLAG_COOKIE, false)
}

export function clearNewSubscriberOnboardingCookie(
  response: NextResponse
): void {
  expireCookie(response, NEW_SUBSCRIBER_ONBOARDING_COOKIE, true)
  expireCookie(response, LEGACY_NEW_SUBSCRIBER_ONBOARDING_COOKIE, true)
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
      secure: true,
      sameSite: 'lax',
      maxAge: ONBOARDING_MAX_AGE_SECONDS,
      path: '/',
    }
  )
  expireCookie(response, LEGACY_NEW_SUBSCRIBER_ONBOARDING_COOKIE, true)
}

export function clearSessionCookies(response: NextResponse): void {
  expireCookie(response, TOKEN_COOKIE, true)
  expireCookie(response, SESSION_FLAG_COOKIE, false)
  expireCookie(response, LEGACY_TOKEN_COOKIE, true)
  expireCookie(response, LEGACY_SESSION_FLAG_COOKIE, false)
  clearNewSubscriberOnboardingCookie(response)
}

function expireCookie(
  response: NextResponse,
  name: string,
  httpOnly: boolean
): void {
  response.cookies.set(name, '', {
    httpOnly,
    secure: name.startsWith('__Host-'),
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
