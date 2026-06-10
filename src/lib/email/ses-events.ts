/**
 * Parses SES events delivered through SNS and composes the human-readable
 * reason stored in email_suppressions. Only events that mark an address
 * undeliverable suppress: permanent bounces and complaints. Transient
 * bounces, deliveries, sends, and everything else are ignored.
 */

export type SesSuppression = { email: string; reason: string }

// Remote MTA diagnostics can run long; the reason column is for an admin to
// read, so keep it to one line of useful detail.
const MAX_DIAGNOSTIC_LENGTH = 300

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function recipientEmails(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  const records: Array<Record<string, unknown>> = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (record) records.push(record)
  }
  return records
}

function fromBounce(bounce: Record<string, unknown> | null): SesSuppression[] {
  // Transient and Undetermined bounces are not suppression-worthy: the
  // mailbox may recover (full inbox, greylisting). Only Permanent bounces
  // mean the address is gone.
  if (!bounce || bounce.bounceType !== 'Permanent') return []
  const subType = asString(bounce.bounceSubType) ?? 'Unknown'
  const results: SesSuppression[] = []
  for (const recipient of recipientEmails(bounce.bouncedRecipients)) {
    const email = asString(recipient.emailAddress)
    if (!email) continue
    const diagnostic = asString(recipient.diagnosticCode)
      ?.replace(/\s+/g, ' ')
      .slice(0, MAX_DIAGNOSTIC_LENGTH)
    const base = `Permanent bounce (${subType})`
    results.push({
      email,
      reason: diagnostic ? `${base}: ${diagnostic}` : base,
    })
  }
  return results
}

function fromComplaint(
  complaint: Record<string, unknown> | null
): SesSuppression[] {
  if (!complaint) return []
  const feedbackType = asString(complaint.complaintFeedbackType)
  const reason = feedbackType ? `Complaint (${feedbackType})` : 'Complaint'
  const results: SesSuppression[] = []
  for (const recipient of recipientEmails(complaint.complainedRecipients)) {
    const email = asString(recipient.emailAddress)
    if (!email) continue
    results.push({ email, reason })
  }
  return results
}

/**
 * Extracts the addresses to suppress from one SES event. Accepts both event
 * shapes SES publishes to SNS: configuration-set event publishing
 * (`eventType`) and identity feedback notifications (`notificationType`).
 * Returns [] for anything that is not a permanent bounce or a complaint.
 */
export function suppressionsFromSesEvent(event: unknown): SesSuppression[] {
  const record = asRecord(event)
  if (!record) return []
  const type = record.eventType ?? record.notificationType
  if (type === 'Bounce') return fromBounce(asRecord(record.bounce))
  if (type === 'Complaint') return fromComplaint(asRecord(record.complaint))
  return []
}
