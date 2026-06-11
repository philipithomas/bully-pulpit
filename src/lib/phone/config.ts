import { siteConfig } from '@/lib/config'

// Phone backend configuration. Ported from junk-drawer's TwilioClient: the
// Twilio numbers stay in code (they are stable, public numbers), while the
// webhook secret comes from the environment. Phone notifications go to the
// ADMIN_EMAILS allowlist.

/** Twilio numbers owned by the Contraption Company, keyed by label. */
export const phoneNumbers: Record<string, string> = {
  NYC: '+12123473190',
  SF: '+14159157592',
}

/** Human label for a Twilio number ("NYC", "SF") or the raw number. */
export function numberLabel(number: string | null | undefined): string {
  if (!number) return 'Unknown'
  const entry = Object.entries(phoneNumbers).find(([, n]) => n === number)
  return entry ? entry[0] : number
}

/**
 * Shared secret that Twilio includes in every webhook URL (`?secret=`).
 * Returns null when unset so callers fail closed.
 */
export function phoneWebhookSecret(): string | null {
  return process.env.PHONE_WEBHOOK_SECRET || null
}

/**
 * Recipients for voicemail, missed call, and SMS notifications. Defaults to
 * the ADMIN_EMAILS allowlist so the people who run the site get the heads-up.
 * If the allowlist is somehow empty (ADMIN_EMAILS explicitly blanked), falls
 * back to a single static address so a phone notification is never dropped on
 * the floor.
 */
export function phoneNotificationRecipients(): string[] {
  const admins = siteConfig.adminEmails
  return admins.length > 0 ? admins : ['philip@contraption.co']
}

/**
 * True when `number` is one of the owned Twilio numbers. Used to allowlist a
 * caller_id (you can only originate outbound calls or texts as a number you
 * own) and to identify the Twilio side of a conversation.
 */
export function isOwnedTwilioNumber(number: string): boolean {
  return Object.values(phoneNumbers).includes(number)
}

/**
 * Owner's personal phone (the cell that rings first on a click-to-call
 * bridge). Returns null when unset so the click-to-call route fails closed.
 */
export function ownerPhoneNumber(): string | null {
  return process.env.OWNER_PHONE_NUMBER || null
}

/** Validates a string as an E.164 phone number ("+" then 7–15 digits). */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value)
}
