import { createAndSendLogin } from '@/lib/auth/login-service'
import { siteConfig } from '@/lib/config'
import { type Newsletter, newsletterSchema } from '@/lib/content/types'
import {
  confirmSubscriber,
  createSubscriber,
  findByEmail,
  type SubscriberPrefs,
  updateSubscriber,
} from '@/lib/db/queries/subscribers'
import { isSuppressed } from '@/lib/db/queries/suppressions'
import type { Subscriber } from '@/lib/db/schema'
import { canReceiveMail } from '@/lib/email/deliverability'
import {
  sendNewSubscriberNotification,
  sendNewsletterOptInNotification,
} from '@/lib/email/send'
import type { ConfirmationPurpose } from '@/lib/email/templates/confirmation'

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

export type CreateResult = {
  subscriber: Subscriber
  isNew: boolean
  nextStep: 'confirmed' | 'verification_sent'
}

function normalizedNewsletters(
  newsletters: string[] | undefined
): Newsletter[] {
  if (!newsletters) return []
  const seen = new Set<Newsletter>()
  for (const newsletter of newsletters) {
    const parsed = newsletterSchema.safeParse(newsletter)
    if (parsed.success) seen.add(parsed.data)
  }
  return [...seen]
}

function prefsForNewsletters(newsletters: Newsletter[]): SubscriberPrefs {
  return {
    ...(newsletters.includes('contraption')
      ? { subscribedContraption: true }
      : {}),
    ...(newsletters.includes('workshop') ? { subscribedWorkshop: true } : {}),
    ...(newsletters.includes('postcard') ? { subscribedPostcard: true } : {}),
    ...(newsletters.includes('tsundoku') ? { subscribedTsundoku: true } : {}),
  }
}

function creationPrefsForNewSubscriber() {
  return {
    subscribedContraption: true,
    subscribedWorkshop: true,
    subscribedPostcard: true,
    subscribedTsundoku: true,
  }
}

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

async function notifyTsundokuOptInBestEffort(
  before: Subscriber,
  after: Subscriber
): Promise<void> {
  if (before.subscribedTsundoku || !after.subscribedTsundoku) return
  try {
    await sendNewsletterOptInNotification(
      after.email,
      siteConfig.newsletters.tsundoku.name
    )
  } catch (err) {
    console.error('[subscriber] newsletter opt-in notification failed:', err)
  }
}

async function sendLoginBestEffort(
  subscriber: Subscriber,
  purpose: ConfirmationPurpose
): Promise<void> {
  try {
    await createAndSendLogin(subscriber, purpose)
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
  subscriber: Subscriber,
  purpose: ConfirmationPurpose
): Promise<void> {
  if (await isSuppressed(subscriber.email)) {
    console.warn(`[subscriber] suppressed address blocked: ${subscriber.email}`)
    throw new SuppressedEmailError()
  }
  await sendLoginBestEffort(subscriber, purpose)
}

/**
 * Creates or retrieves a subscriber, branching exactly like printing-press's
 * create_or_retrieve: Google sign-in confirms immediately; unconfirmed rows
 * receive an OTP / magic-link email; confirmed rows only receive a sign-in code
 * when the call is actually a sign-in.
 *
 * `name` and `source` apply only when the row is created. New public signups
 * start on every newsletter. For existing subscribers, an explicit
 * `newsletters` list only opts them into those newsletters; no list means the
 * call is a pure sign-in and leaves preferences untouched.
 */
export async function createOrRetrieve(input: {
  email: string
  name?: string | null
  source?: string | null
  /** Newsletter slugs to opt an existing row into; new rows receive all newsletters. */
  newsletters?: string[]
  googleVerified?: boolean
}): Promise<CreateResult> {
  const email = input.email.trim().toLowerCase()
  if (!isValidEmail(email)) {
    throw new InvalidEmailError()
  }
  const googleVerified = input.googleVerified ?? false

  // Non-Google subscribe/sign-in starts from an email address and may need to
  // send mail, so check DNS deliverability before any DB row is created and
  // before SES can hard-bounce on a typo domain. Google sign-in sends no email
  // and skips the check. canReceiveMail fails open on resolver trouble.
  if (!googleVerified && !(await canReceiveMail(email))) {
    throw new UndeliverableEmailError()
  }

  const newsletters = normalizedNewsletters(input.newsletters)
  const hasExplicitNewsletterOptIn = input.newsletters !== undefined
  const hasRequestedNewsletterOptIn =
    hasExplicitNewsletterOptIn && newsletters.length > 0

  const existing = await findByEmail(email)
  if (existing) {
    let subscriber = existing

    if (hasRequestedNewsletterOptIn) {
      const updated = await updateSubscriber(
        existing.uuid,
        prefsForNewsletters(newsletters)
      )
      if (updated) {
        await notifyTsundokuOptInBestEffort(existing, updated)
        subscriber = updated
      }
    }

    if (googleVerified && existing.confirmedAt == null) {
      const confirmed = await confirmSubscriber(existing.id)
      await notifyNewSubscriber(confirmed)
      return { subscriber: confirmed, isNew: false, nextStep: 'confirmed' }
    }

    if (subscriber.confirmedAt == null) {
      await sendLoginOrRejectSuppressed(subscriber, 'confirm')
      return { subscriber, isNew: false, nextStep: 'verification_sent' }
    } else if (!googleVerified) {
      if (hasRequestedNewsletterOptIn) {
        return { subscriber, isNew: false, nextStep: 'confirmed' }
      }
      await sendLoginOrRejectSuppressed(subscriber, 'sign-in')
      return { subscriber, isNew: false, nextStep: 'verification_sent' }
    }

    return { subscriber, isNew: false, nextStep: 'confirmed' }
  }

  const subscriber = await createSubscriber({
    email,
    name: input.name,
    source: input.source,
    ...creationPrefsForNewSubscriber(),
  })

  if (googleVerified) {
    const confirmed = await confirmSubscriber(subscriber.id)
    await notifyNewSubscriber(confirmed)
    return { subscriber: confirmed, isNew: true, nextStep: 'confirmed' }
  }

  await sendLoginOrRejectSuppressed(subscriber, 'confirm')
  return { subscriber, isNew: true, nextStep: 'verification_sent' }
}
