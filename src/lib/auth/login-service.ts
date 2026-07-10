import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'
import {
  createLogin,
  findValidByToken,
  incrementAttemptsForSubscriber,
  markEmailSent,
  markVerified,
  type TokenType,
} from '@/lib/db/queries/logins'
import {
  confirmSubscriber,
  findByEmail,
  findById,
} from '@/lib/db/queries/subscribers'
import type { Login, Subscriber } from '@/lib/db/schema'
import {
  sendConfirmation,
  sendNewSubscriberNotification,
} from '@/lib/email/send'
import type { ConfirmationPurpose } from '@/lib/email/templates/confirmation'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000

/** Thrown when a sign-in code / magic-link token is invalid, expired, or locked. */
export class InvalidTokenError extends Error {
  constructor() {
    super('Invalid or expired token')
    this.name = 'InvalidTokenError'
  }
}

function generateCode(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return (arr[0] % 1_000_000).toString().padStart(6, '0')
}

/**
 * Detects a Postgres unique violation (SQLSTATE 23505). The Neon driver puts
 * the SQLSTATE on `code`; drizzle may wrap the driver error as `cause`.
 * Exported so the integration suite can assert other drivers (PGlite) surface
 * the same shape — the code-collision retry depends on it.
 */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  while (typeof current === 'object' && current !== null) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/**
 * Inserts a code-type login, retrying on collision: code lookups are scoped
 * per-subscriber but UNIQUE(token) is table-global, so a fresh 6-digit code
 * can collide with any historical row.
 */
async function createCodeLogin(
  subscriberId: number,
  expiredAt: Date
): Promise<{ code: string; login: Login }> {
  for (let attempt = 1; ; attempt++) {
    const code = generateCode()
    try {
      const login = await createLogin({
        subscriberId,
        token: code,
        tokenType: 'code',
        expiredAt,
      })
      return { code, login }
    } catch (err) {
      if (attempt >= 3 || !isUniqueViolation(err)) throw err
    }
  }
}

/** Display names of the newsletters a subscriber's row opts into, for email copy. */
function subscribedNewsletterNames(subscriber: Subscriber): string[] {
  const names: string[] = []
  if (subscriber.subscribedContraption) names.push('Contraption')
  if (subscriber.subscribedWorkshop) names.push('Workshop')
  if (subscriber.subscribedPostcard) names.push('Postcard')
  return names
}

function verificationUrl(
  token: string,
  pendingNewsletters: Newsletter[] | undefined
): string {
  const url = new URL('/auth/verify', siteConfig.url)
  url.searchParams.set('token', token)
  for (const newsletter of pendingNewsletters ?? []) {
    url.searchParams.append('newsletter', newsletter)
  }
  return url.toString()
}

/**
 * Creates a 6-digit code login AND a magic-link login (both 15-min expiry) and
 * emails them. Ported from printing-press's create_and_send_login. `purpose`
 * picks the email copy: 'confirm' for a new or still-unconfirmed subscription
 * (names what the row subscribes to), 'sign-in' for a returning member.
 */
export async function createAndSendLogin(
  subscriber: Subscriber,
  purpose: ConfirmationPurpose = 'sign-in',
  options: { pendingNewsletters?: Newsletter[] } = {}
): Promise<void> {
  const expiredAt = new Date(Date.now() + FIFTEEN_MINUTES_MS)

  const { code, login: codeLogin } = await createCodeLogin(
    subscriber.id,
    expiredAt
  )

  const magicToken = crypto.randomUUID()
  const magicLogin = await createLogin({
    subscriberId: subscriber.id,
    token: magicToken,
    tokenType: 'magic_link',
    expiredAt,
  })

  const magicLink = verificationUrl(magicToken, options.pendingNewsletters)
  await sendConfirmation(subscriber.email, code, magicLink, {
    purpose,
    newsletters: subscribedNewsletterNames(subscriber),
  })
  await markEmailSent(codeLogin.id)
  await markEmailSent(magicLogin.id)
}

/**
 * Verifies a token (6 digits ⇒ code, else magic link), confirms the subscriber,
 * and sends the admin notification on first confirmation. Throws InvalidTokenError
 * for bad tokens, incrementing the per-subscriber attempt counter for codes.
 */
export async function verifyTokenWithMetadata(
  token: string,
  email?: string
): Promise<{ subscriber: Subscriber; newlyConfirmed: boolean }> {
  const tokenType: TokenType = /^\d{6}$/.test(token) ? 'code' : 'magic_link'

  // A 6-digit code is only meaningful for the account it was minted for, so it
  // must arrive with an email and is looked up scoped to that subscriber — a
  // global match would let a guessed code sign a session for whichever account
  // it happened to belong to, and rotating garbage emails would dodge the
  // per-subscriber lockout entirely. Magic links are 122-bit UUIDs and remain
  // valid without an email.
  let codeSubscriberId: number | undefined
  if (tokenType === 'code') {
    if (!email) {
      throw new InvalidTokenError()
    }
    const subscriber = await findByEmail(email)
    if (!subscriber) {
      throw new InvalidTokenError()
    }
    codeSubscriberId = subscriber.id
  }

  const login = await findValidByToken(token, tokenType, codeSubscriberId)

  if (!login) {
    if (codeSubscriberId !== undefined) {
      await incrementAttemptsForSubscriber(codeSubscriberId)
    }
    throw new InvalidTokenError()
  }

  const existing = await findById(login.subscriberId)
  const wasAlreadyConfirmed = existing?.confirmedAt != null

  await markVerified(login.id)
  const subscriber = await confirmSubscriber(login.subscriberId)

  if (!wasAlreadyConfirmed) {
    try {
      await sendNewSubscriberNotification(
        subscriber.email,
        subscriber.name,
        subscriber.source
      )
    } catch (err) {
      console.error('[login] new subscriber notification failed:', err)
    }
  }

  return { subscriber, newlyConfirmed: !wasAlreadyConfirmed }
}

export async function verifyToken(
  token: string,
  email?: string
): Promise<Subscriber> {
  return (await verifyTokenWithMetadata(token, email)).subscriber
}
