/**
 * How long after publication a post counts as "current" for sending. Older
 * posts with no send history are archival: the Posts list stops linking them
 * into the send flow and the Overview stops suggesting them.
 */
export const SENDABLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function isRecent(publishedAt: string, now = Date.now()): boolean {
  return new Date(publishedAt).getTime() >= now - SENDABLE_WINDOW_MS
}
