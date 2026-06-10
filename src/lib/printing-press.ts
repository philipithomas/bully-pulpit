/**
 * How long a never-sent post wears the "Not sent" badge in the Posts list.
 * Older unsent posts are archival; the badge would read as a problem.
 */
export const NOT_SENT_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * How far back the Overview looks when nudging about unsent posts. Wider than
 * the badge window because the newsletters run on a roughly monthly cadence.
 */
export const SEND_NUDGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export function isRecent(
  publishedAt: string,
  windowMs: number,
  now = Date.now()
): boolean {
  return new Date(publishedAt).getTime() >= now - windowMs
}

/**
 * One prose sentence for the subscribers list describing why delivery to an
 * address is off. Reasons come in two shapes: rich webhook strings such as
 * 'Permanent bounce (General): smtp; 550 5.1.1 user unknown' and the SES
 * suppression list's terse enum ('BOUNCE'). Both read as mid-sentence detail
 * after the date, per the colophon: sentence case, ISO date, no contractions.
 */
export function suppressionSentence(
  reason: string,
  suppressedAt: string
): string {
  const date = suppressedAt.slice(0, 10)
  const detail = /^[A-Z_]+$/.test(reason)
    ? reason.toLowerCase().replace(/_/g, ' ')
    : (reason.charAt(0).toLowerCase() + reason.slice(1)).replace(': ', ', ')
  return `Deliverability off since ${date}: ${detail.replace(/\.+$/, '')}.`
}
