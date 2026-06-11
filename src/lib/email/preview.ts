// An iframe cannot be forced into prefers-color-scheme: dark, so the admin
// preview rewrites the dark media query condition to one that always applies.
// This renders the email through its OWN dark overrides (the same block a
// dark-mode client activates) rather than faking an inversion. Preview only:
// the send and test-send paths never see this transform.
const DARK_MEDIA_QUERY = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/g

/** Rewrites every dark-scheme media query in `html` to apply unconditionally. */
export function forceDarkColorScheme(html: string): string {
  return html.replace(DARK_MEDIA_QUERY, '@media all')
}
