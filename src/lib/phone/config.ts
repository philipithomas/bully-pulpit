import { siteConfig } from '@/lib/config'

// Phone backend configuration. Phone notifications go to the ADMIN_EMAILS
// allowlist. The public Twilio number is environment-specific because each
// Vercel environment has a single active phone line.

function configuredSitePhoneNumber(): string | null {
  return process.env.PHONE_NUMBER?.trim() || null
}

/** Public Twilio number for this environment, or null when absent/invalid. */
export function sitePhoneNumber(): string | null {
  const number = configuredSitePhoneNumber()
  return number && isE164(number) ? number : null
}

/** Public Twilio number for this environment. Throws on missing config. */
export function requireSitePhoneNumber(): string {
  const number = configuredSitePhoneNumber()
  if (!number) {
    throw new Error('PHONE_NUMBER is not configured')
  }
  if (!isE164(number)) {
    throw new Error('PHONE_NUMBER must be an E.164 number')
  }
  return number
}

/** Formats NANP E.164 numbers for display while leaving other regions intact. */
export function formatPhoneNumberForDisplay(number: string): string {
  const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(number)
  return nanp ? `+1 ${nanp[1]} ${nanp[2]} ${nanp[3]}` : number
}

/** Display label for the public Twilio number, or null when not configured. */
export function sitePhoneDisplayNumber(): string | null {
  const number = sitePhoneNumber()
  return number ? formatPhoneNumberForDisplay(number) : null
}

/** Human label for the configured Twilio number or the raw number. */
export function numberLabel(number: string | null | undefined): string {
  if (!number) return 'Unknown'
  return number === sitePhoneNumber() ? 'Phone' : number
}

/**
 * Twilio auth token. Also used as the shared `?secret=` value on webhook URLs.
 * Returns null when unset so callers fail closed.
 */
export function twilioSecret(): string | null {
  return process.env.TWILIO_SECRET || null
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
