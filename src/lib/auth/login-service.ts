import { siteConfig } from '@/lib/config'
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
import type { Subscriber } from '@/lib/db/schema'
import {
  sendConfirmation,
  sendNewSubscriberNotification,
} from '@/lib/email/send'

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
 * Creates a 6-digit code login AND a magic-link login (both 15-min expiry) and
 * emails them. Ported from printing-press's create_and_send_login.
 */
export async function createAndSendLogin(
  subscriber: Subscriber
): Promise<void> {
  const expiredAt = new Date(Date.now() + FIFTEEN_MINUTES_MS)

  const code = generateCode()
  const codeLogin = await createLogin({
    subscriberId: subscriber.id,
    token: code,
    tokenType: 'code',
    expiredAt,
  })

  const magicToken = crypto.randomUUID()
  const magicLogin = await createLogin({
    subscriberId: subscriber.id,
    token: magicToken,
    tokenType: 'magic_link',
    expiredAt,
  })

  const magicLink = `${siteConfig.url}/auth/verify?token=${magicToken}`
  await sendConfirmation(subscriber.email, code, magicLink)
  await markEmailSent(codeLogin.id)
  await markEmailSent(magicLogin.id)
}

/**
 * Verifies a token (6 digits ⇒ code, else magic link), confirms the subscriber,
 * and sends the admin notification on first confirmation. Throws InvalidTokenError
 * for bad tokens, incrementing the per-subscriber attempt counter for codes.
 */
export async function verifyToken(
  token: string,
  email?: string
): Promise<Subscriber> {
  const tokenType: TokenType = /^\d{6}$/.test(token) ? 'code' : 'magic_link'
  const login = await findValidByToken(token, tokenType)

  if (!login) {
    if (tokenType === 'code' && email) {
      const subscriber = await findByEmail(email)
      if (subscriber) {
        await incrementAttemptsForSubscriber(subscriber.id)
      }
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

  return subscriber
}
