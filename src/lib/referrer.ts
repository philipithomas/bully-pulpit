let captured: string | null = null
let initialized = false

/**
 * Returns the external referrer from the initial page load, or null if
 * the visitor came directly or from the same site. Captured once and
 * cached for the lifetime of the page.
 */
export function getExternalReferrer(): string | null {
  if (initialized) return captured
  initialized = true

  if (typeof document === 'undefined') return null
  const ref = document.referrer
  if (!ref) return null

  try {
    const url = new URL(ref)
    if (url.hostname === location.hostname) return null
    captured = url.origin
  } catch {
    // malformed referrer — ignore
  }
  return captured
}
