import { createAndSendLogin } from '@/lib/auth/login-service'
import {
  confirmSubscriber,
  createSubscriber,
  findByEmail,
} from '@/lib/db/queries/subscribers'
import { isSuppressed } from '@/lib/db/queries/suppressions'
import type { Subscriber } from '@/lib/db/schema'
import { canReceiveMail } from '@/lib/email/deliverability'
import { sendNewSubscriberNotification } from '@/lib/email/send'

/** Thrown for a malformed email address (maps to HTTP 400). */
export class InvalidEmailError extends Error {
  constructor() {
    super('Invalid email address')
    this.name = 'InvalidEmailError'
  }
}

/** Thrown when the email's domain has no mail host per DNS (maps to HTTP 400). */
export class UndeliverableEmailError extends Error {
  constructor() {
    super('Email domain cannot receive mail')
    this.name = 'UndeliverableEmailError'
  }
}

/** Thrown when the address is on the email suppression list (maps to HTTP 422). */
export class SuppressedEmailError extends Error {
  constructor() {
    super('Email address is suppressed')
    this.name = 'SuppressedEmailError'
  }
}

/** Validates `local@domain.tld`. Ported from printing-press's is_valid_email. */
function isValidEmail(email: string): boolean {
  const at = email.indexOf('@')
  if (at <= 0) return false
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!local || !domain) return false
  const dot = domain.lastIndexOf('.')
  if (dot <= 0) return false
  const host = domain.slice(0, dot)
  const tld = domain.slice(dot + 1)
  if (!host || tld.length < 2) return false
  return !email.includes(' ')
}

export type CreateResult = { subscriber: Subscriber; isNew: boolean }

async function notifyNewSubscriber(subscriber: Subscriber): Promise<void> {
  try {
    await sendNewSubscriberNotification(
      subscriber.email,
      subscriber.name,
      subscriber.source
    )
  } catch (err) {
    console.error('[subscriber] new subscriber notification failed:', err)
  }
}

async function sendLoginBestEffort(subscriber: Subscriber): Promise<void> {
  try {
    await createAndSendLogin(subscriber)
  } catch (err) {
    console.error('[subscriber] confirmation/sign-in email failed:', err)
  }
}

/**
 * SES silently drops sends to suppressed addresses, so fail loudly before the
 * send. The check must live here, not in createAndSendLogin — anything thrown
 * inside sendLoginBestEffort's try is swallowed.
 */
async function sendLoginOrRejectSuppressed(
  subscriber: Subscriber
): Promise<void> {
  if (await isSuppressed(subscriber.email)) {
    console.warn(`[subscriber] suppressed address blocked: ${subscriber.email}`)
    throw new SuppressedEmailError()
  }
  await sendLoginBestEffort(subscriber)
}

/**
 * Creates or retrieves a subscriber, branching exactly like printing-press's
 * create_or_retrieve: Google sign-in confirms immediately; otherwise an OTP /
 * magic-link email is sent (resend for unconfirmed, sign-in code for confirmed).
 */
export async function createOrRetrieve(input: {
  email: string
  name?: string | null
  source?: string | null
  googleVerified?: boolean
}): Promise<CreateResult> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    throw new InvalidEmailError()
  }
  const googleVerified = input.googleVerified ?? false

  // Every non-Google branch below sends a confirmation or sign-in email, so
  // check DNS deliverability first: before any DB row is created and before
  // SES can hard-bounce on a typo domain. Google sign-in sends no email and
  // skips the check. canReceiveMail fails open on resolver trouble.
  if (!googleVerified && !(await canReceiveMail(email))) {
    throw new UndeliverableEmailError()
  }

  const existing = await findByEmail(email)
  if (existing) {
    if (googleVerified && existing.confirmedAt == null) {
      const confirmed = await confirmSubscriber(existing.id)
      await notifyNewSubscriber(confirmed)
      return { subscriber: confirmed, isNew: false }
    }

    if (existing.confirmedAt == null) {
      await sendLoginOrRejectSuppressed(existing)
    } else if (!googleVerified) {
      await sendLoginOrRejectSuppressed(existing)
    }

    return { subscriber: existing, isNew: false }
  }

  const subscriber = await createSubscriber({
    email,
    name: input.name,
    source: input.source,
  })

  if (googleVerified) {
    const confirmed = await confirmSubscriber(subscriber.id)
    await notifyNewSubscriber(confirmed)
    return { subscriber: confirmed, isNew: true }
  }

  await sendLoginOrRejectSuppressed(subscriber)
  return { subscriber, isNew: true }
}
