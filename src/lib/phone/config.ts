// Phone backend configuration. Ported from junk-drawer's TwilioClient: the
// Twilio numbers stay in code (they are stable, public numbers), while the
// webhook secret and notification recipient come from the environment.

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

/** Recipient for voicemail, missed call, and SMS notifications. */
export function phoneNotificationEmail(): string {
  return process.env.PHONE_NOTIFICATION_EMAIL || 'philip@contraption.co'
}
