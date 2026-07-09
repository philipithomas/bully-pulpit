import { createHmac } from 'node:crypto'
import { siteConfig } from '@/lib/config'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function identitySecret(): string {
  const configured = process.env.BELL_IDENTITY_SECRET?.trim()
  if (configured) return configured
  if (process.env.VERCEL_ENV === 'production') {
    throw new Error('BELL_IDENTITY_SECRET is required in production')
  }
  return siteConfig.jwtSecret
}

function hmac(value: string): string {
  return createHmac('sha256', identitySecret()).update(value).digest('hex')
}

export function isClientConversationId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * A client UUID is only a correlation key. Once the server has attributed its
 * conversation to a subscriber, a signed-out request or a different account
 * must start a new UUID instead of appending under that subscriber.
 */
export function canAppendToWebBellConversation(
  conversationSubscriberId: number | null,
  requestSubscriberId: number | null
): boolean {
  return (
    conversationSubscriberId === null ||
    conversationSubscriberId === requestSubscriberId
  )
}

export function utcIdentityPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Produces a monthly, unlinkable network label. The request IP exists only
 * long enough to calculate the digest and is never returned.
 */
export function networkIdentityForRequest(
  request: Request,
  now = new Date()
): { hash: string; period: string } | null {
  const period = utcIdentityPeriod(now)
  const forwarded =
    request.headers.get('x-vercel-forwarded-for') ??
    request.headers.get('x-forwarded-for')
  const ip =
    forwarded?.split(',')[0]?.trim().toLowerCase() ||
    request.headers.get('x-real-ip')?.trim().toLowerCase()
  if (!ip || ip === 'unknown') return null
  return {
    hash: hmac(`bell-network\n${period}\n${ip}`),
    period,
  }
}

/** Stable keyed lookup for an SMS thread. The phone number is not persisted. */
export function smsIdentityHash(phoneNumber: string): string {
  return hmac(`bell-sms\n${phoneNumber.trim()}`)
}
