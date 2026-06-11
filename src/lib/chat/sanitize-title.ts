/**
 * The chat client sends document.title with each request, and the route
 * interpolates it inside double quotes on the system prompt's current-page
 * line, so the value is attacker-controlled prompt input. This makes it
 * inert before the cap: control characters (including newlines) become
 * spaces, double quotes become single quotes, whitespace runs collapse,
 * then the result is trimmed and capped at 200 characters. Anything that
 * is not a string or sanitizes to nothing becomes undefined so the chat
 * never fails over page context.
 */
export function sanitizePageTitle(rawTitle: unknown): string | undefined {
  if (typeof rawTitle !== 'string') return undefined
  const cleanTitle = rawTitle
    .replace(/\p{Cc}/gu, ' ')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
  return cleanTitle === '' ? undefined : cleanTitle
}
