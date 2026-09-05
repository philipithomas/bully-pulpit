import { createAndSendLogin } from '@/lib/auth/login-service'
import { type Newsletter, newsletterSchema } from '@/lib/content/types'
import {
  claimTidbitsOptInNotification,
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
  sendExistingSubscriberOptInNotification,
  sendNewSubscriberNotification,
} from '@/lib/email/send'
import type { ConfirmationPurpose } from '@/lib/email/templates/confirmation'
import {
  defaultSignupNewsletters,
  isNewsletterAcceptingSubscriptions,
} from '@/lib/newsletters'

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
  newlyConfirmed: boolean
  changedNewsletters: Newsletter[]
  nextStep: 'confirmed' | 'verification_sent'
}

const subscriberNewsletterPreferences = [
  ['contraption', 'subscribedContraption'],
  ['workshop', 'subscribedWorkshop'],
  ['postcard', 'subscribedPostcard'],
  ['tidbits', 'subscribedTidbits'],
] as const

export function subscribedNewslettersForSubscriber(
  subscriber: Subscriber
): Newsletter[] {
  return subscriberNewsletterPreferences
    .filter(([, key]) => subscriber[key])
    .map(([newsletter]) => newsletter)
}

function changedNewsletterOptIns(
  before: Subscriber,
  after: Subscriber
): Newsletter[] {
  return subscriberNewsletterPreferences
    .filter(([, key]) => !before[key] && after[key])
    .map(([newsletter]) => newsletter)
}

export function normalizedNewsletters(
  newsletters: string[] | undefined
): Newsletter[] {
  if (!newsletters) return []
  const seen = new Set<Newsletter>()
  for (const newsletter of newsletters) {
    // Magic links and open signup forms issued just before the rename remain
    // valid for 15 minutes. Carry their consent forward to Tidbits.
    const currentNewsletter = newsletter === 'umami' ? 'tidbits' : newsletter
    const parsed = newsletterSchema.safeParse(currentNewsletter)
    if (parsed.success && isNewsletterAcceptingSubscriptions(parsed.data)) {
      seen.add(parsed.data)
    }
  }
  return [...seen]
}

export function prefsForNewsletters(
  newsletters: Newsletter[]
): SubscriberPrefs {
  const accepts = (newsletter: Newsletter) =>
    newsletters.includes(newsletter) &&
    isNewsletterAcceptingSubscriptions(newsletter)
  return {
    ...(accepts('contraption') ? { subscribedContraption: true } : {}),
    ...(accepts('workshop') ? { subscribedWorkshop: true } : {}),
    ...(accepts('postcard') ? { subscribedPostcard: true } : {}),
    ...(accepts('tidbits') ? { subscribedTidbits: true } : {}),
  }
}

export async function applyNewsletterOptIns(
  subscriber: Subscriber,
  newsletters: Newsletter[]
): Promise<Subscriber> {
  if (newsletters.length === 0) return subscriber
  const updated = await updateSubscriber(
    subscriber.uuid,
    prefsForNewsletters(newsletters)
  )
  if (!updated) return subscriber
  return updated
}

function creationPrefsForNewSubscriber(newsletters: Newsletter[]) {
  // A focused CTA is an explicit subscription choice. Generic entry points
  // either omit the list or send the full default set; an empty normalized
  // list (including archived/invalid-only input) deliberately falls back to
  // the active defaults so an obsolete client cannot create a zero-list row.
  const selected = new Set(
    newsletters.length > 0 ? newsletters : defaultSignupNewsletters
  )
  return {
    subscribedContraption: selected.has('contraption'),
    subscribedWorkshop: selected.has('workshop'),
    subscribedPostcard: selected.has('postcard'),
    subscribedTidbits: selected.has('tidbits'),
    // Archived newsletter columns remain for historical data only.
    subscribedTsundoku: false,
  }
}

async function replacePendingNewsletterSelection(
  subscriber: Subscriber,
  newsletters: Newsletter[]
): Promise<Subscriber> {
  const updated = await updateSubscriber(
    subscriber.uuid,
    creationPrefsForNewSubscriber(newsletters)
  )
  return updated ?? subscriber
}

/**
 * Best-effort admin notification for the deliberate existing-reader Tidbits
 * transition. New confirmations have their own notification and must not emit
 * this one as well.
 */
export async function notifyExistingSubscriberOptIns(
  before: Subscriber,
  after: Subscriber,
  wasExistingConfirmed = before.confirmedAt != null
): Promise<void> {
  if (
    !wasExistingConfirmed ||
    before.subscribedTidbits ||
    !after.subscribedTidbits
  ) {
    return
  }

  try {
    if (!(await claimTidbitsOptInNotification(after.id))) return
    await sendExistingSubscriberOptInNotification(
      after.email,
      after.name,
      'tidbits'
    )
  } catch (err) {
    console.error('[subscriber] Tidbits opt-in notification failed:', err)
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

async function sendLoginBestEffort(
  subscriber: Subscriber,
  purpose: ConfirmationPurpose,
  pendingNewsletters?: Newsletter[]
): Promise<void> {
  try {
    await createAndSendLogin(subscriber, purpose, { pendingNewsletters })
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
  purpose: ConfirmationPurpose,
  pendingNewsletters?: Newsletter[]
): Promise<void> {
  if (await isSuppressed(subscriber.email)) {
    console.warn(`[subscriber] suppressed address blocked: ${subscriber.email}`)
    throw new SuppressedEmailError()
  }
  await sendLoginBestEffort(subscriber, purpose, pendingNewsletters)
}

/**
 * Creates or retrieves a subscriber, branching exactly like printing-press's
 * create_or_retrieve: Google sign-in confirms immediately; unconfirmed rows
 * receive an OTP / magic-link email; confirmed rows only receive a sign-in code
 * when the call is actually a sign-in.
 *
 * `name` and `source` apply only when the row is created. New public signups
 * honor a non-empty explicit list of active newsletters; absent, empty, or
 * invalid-only lists use the all-active default. For existing confirmed
 * subscribers, public forms sign them in without changing preferences unless
 * the caller explicitly allows email-only opt-in. An unconfirmed row keeps the
 * first signup's stored scope across unauthenticated retries. A verified Google
 * identity replaces that pending scope with its current surface's exact
 * selection (or the active defaults for a generic sign-in) before confirming.
 */
export async function createOrRetrieve(input: {
  email: string
  name?: string | null
  source?: string | null
  /** Newsletter slugs to opt an existing row into; inactive slugs are ignored. */
  newsletters?: string[]
  /** Permit a confirmed existing subscriber to opt in by email without signing in. */
  allowExistingSubscriberOptIn?: boolean
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
  const allowExistingSubscriberOptIn =
    input.allowExistingSubscriberOptIn === true

  const existing = await findByEmail(email)
  if (existing) {
    let subscriber = existing

    if (googleVerified && existing.confirmedAt == null) {
      subscriber = await replacePendingNewsletterSelection(
        existing,
        newsletters
      )
    } else if (
      hasRequestedNewsletterOptIn &&
      existing.confirmedAt != null &&
      allowExistingSubscriberOptIn
    ) {
      subscriber = await applyNewsletterOptIns(existing, newsletters)
    }
    const changedNewsletters = changedNewsletterOptIns(existing, subscriber)
    await notifyExistingSubscriberOptIns(existing, subscriber)

    if (googleVerified && existing.confirmedAt == null) {
      const confirmed = await confirmSubscriber(existing.id)
      await notifyNewSubscriber(confirmed)
      return {
        subscriber: confirmed,
        isNew: false,
        newlyConfirmed: true,
        changedNewsletters,
        nextStep: 'confirmed',
      }
    }

    if (subscriber.confirmedAt == null) {
      await sendLoginOrRejectSuppressed(subscriber, 'confirm')
      return {
        subscriber,
        isNew: false,
        newlyConfirmed: false,
        changedNewsletters,
        nextStep: 'verification_sent',
      }
    } else if (!googleVerified) {
      if (hasRequestedNewsletterOptIn && allowExistingSubscriberOptIn) {
        return {
          subscriber,
          isNew: false,
          newlyConfirmed: false,
          changedNewsletters,
          nextStep: 'confirmed',
        }
      }
      await sendLoginOrRejectSuppressed(
        subscriber,
        'sign-in',
        hasRequestedNewsletterOptIn ? newsletters : undefined
      )
      return {
        subscriber,
        isNew: false,
        newlyConfirmed: false,
        changedNewsletters,
        nextStep: 'verification_sent',
      }
    }

    return {
      subscriber,
      isNew: false,
      newlyConfirmed: false,
      changedNewsletters,
      nextStep: 'confirmed',
    }
  }

  const subscriber = await createSubscriber({
    email,
    name: input.name,
    source: input.source,
    ...creationPrefsForNewSubscriber(newsletters),
  })

  if (googleVerified) {
    const confirmed = await confirmSubscriber(subscriber.id)
    await notifyNewSubscriber(confirmed)
    return {
      subscriber: confirmed,
      isNew: true,
      newlyConfirmed: true,
      changedNewsletters: [],
      nextStep: 'confirmed',
    }
  }

  await sendLoginOrRejectSuppressed(subscriber, 'confirm')
  return {
    subscriber,
    isNew: true,
    newlyConfirmed: false,
    changedNewsletters: [],
    nextStep: 'verification_sent',
  }
}
