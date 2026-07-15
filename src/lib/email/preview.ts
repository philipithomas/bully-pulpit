// An iframe cannot override the browser's prefers-color-scheme, so the admin
// preview rewrites the email's dark media query. The selected scheme is then
// deterministic even when the developer's OS uses the opposite appearance.
// This renders the email through its OWN styles rather than faking an
// inversion. Preview only: send and test-send never see these transforms.
const DARK_MEDIA_QUERY = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/g

/** Rewrites every dark-scheme media query in `html` to apply unconditionally. */
export function forceDarkColorScheme(html: string): string {
  return html.replace(DARK_MEDIA_QUERY, '@media all')
}

/** Rewrites every dark-scheme media query in `html` so it cannot apply. */
export function forceLightColorScheme(html: string): string {
  return html.replace(DARK_MEDIA_QUERY, '@media not all')
}
