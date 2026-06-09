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
