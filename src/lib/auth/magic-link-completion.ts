import { jwtVerify, SignJWT } from 'jose'
import type { NextResponse } from 'next/server'
import {
  type AnalyticsNewsletter,
  parseAnalyticsNewsletter,
} from '@/lib/analytics/events'
import { siteConfig } from '@/lib/config'

export const MAGIC_LINK_COMPLETION_COOKIE = '__Host-bp_magic_completion'

const MAX_AGE_SECONDS = 60 * 2
const ISSUER = 'https://www.philipithomas.com'
const AUDIENCE = 'philipithomas.com:magic-link-completion'
const PURPOSE = 'magic-link-completion'

export type MagicLinkCompletion = {
  newsletter: AnalyticsNewsletter
  newSubscriber: boolean
  destination: 'home' | 'account'
}

function secret(): Uint8Array {
  return new TextEncoder().encode(siteConfig.jwtSecret)
}

function isAnalyticsNewsletter(value: unknown): value is AnalyticsNewsletter {
  return (
    typeof value === 'string' &&
    (value === 'unknown' || parseAnalyticsNewsletter(value) === value)
  )
}

async function signMagicLinkCompletion(
  completion: MagicLinkCompletion
): Promise<string> {
  return new SignJWT({
    purpose: PURPOSE,
    newsletter: completion.newsletter,
    newSubscriber: completion.newSubscriber,
    destination: completion.destination,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('2m')
    .sign(secret())
}

export async function verifyMagicLinkCompletionCookie(
  marker: string
): Promise<MagicLinkCompletion | null> {
  try {
    const { payload } = await jwtVerify(marker, secret(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (
      payload.purpose !== PURPOSE ||
      !isAnalyticsNewsletter(payload.newsletter) ||
      typeof payload.newSubscriber !== 'boolean' ||
      (payload.destination !== 'home' && payload.destination !== 'account')
    ) {
      return null
    }
    return {
      newsletter: payload.newsletter,
      newSubscriber: payload.newSubscriber,
      destination: payload.destination,
    }
  } catch {
    return null
  }
}

export async function setMagicLinkCompletionCookie(
  response: NextResponse,
  completion: MagicLinkCompletion
): Promise<void> {
  response.cookies.set(
    MAGIC_LINK_COMPLETION_COOKIE,
    await signMagicLinkCompletion(completion),
    {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: MAX_AGE_SECONDS,
      path: '/',
    }
  )
}

export function clearMagicLinkCompletionCookie(response: NextResponse): void {
  response.cookies.set(MAGIC_LINK_COMPLETION_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
}
