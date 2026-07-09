const PRIVATE_PATHS = [
  '/account',
  '/admin',
  '/auth',
  '/printing-press',
  '/unsubscribe',
] as const

function matchesPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isPublicAnalyticsPath(pathname: string): boolean {
  let decodedPathname = pathname
  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {}

  return !PRIVATE_PATHS.some((prefix) =>
    matchesPathPrefix(decodedPathname, prefix)
  )
}

/**
 * Drops private pages and strips every query string and hash before Vercel sees
 * the pageview or custom event URL. Search text, auth tokens, and status query
 * parameters never belong in aggregate analytics.
 */
export function redactAnalyticsEvent<
  Event extends { type: string; url: string; route?: string },
>(event: Event, origin: string): Event | null {
  try {
    const url = new URL(event.url, origin)
    if (!isPublicAnalyticsPath(url.pathname)) return null
    return { ...event, url: `${url.origin}${url.pathname}` }
  } catch {
    return null
  }
}
