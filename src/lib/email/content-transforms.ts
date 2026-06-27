import { siteConfig } from '@/lib/config'
import type { NewsletterSlug } from '@/lib/db/queries/subscribers'

// Ported from printing-press's templates/mod.rs. These run over the rendered
// email body just before it is wrapped in the newsletter shell.

const accentColors: Record<NewsletterSlug, string> = {
  contraption: '#2b4a3e',
  workshop: '#6b4d3a',
  postcard: '#2c3e6b',
  tsundoku: '#e20612',
}
const DEFAULT_ACCENT = '#3B3834'

/**
 * Rewrites root-relative `href`/`src` URLs to absolute ones so links and images
 * resolve in email clients (which have no base URL). Leaves protocol-relative
 * (`//`), absolute, `mailto:`, and `#` URLs untouched. Uses siteConfig.url (no
 * `www`) to match the absolute URLs the body renderer already emits.
 */
export function resolveRelativeUrls(
  html: string,
  baseUrl: string = siteConfig.url
): string {
  return html.replace(
    /(href|src)(=["'])\/([^/])/g,
    (_match, attr, eq, next) => `${attr}${eq}${baseUrl}/${next}`
  )
}

/**
 * Unwraps fragment-only anchors (`<a href="#fn1">[1]</a>` → `[1]`), keeping
 * the visible text. The email render never emits `id` targets (the markdown
 * pipeline adds none, and the shell has none), so every fragment-only href is
 * a dead link in email clients. Ghost-migration footnote markup is the main
 * source: `[\[1\]](#fn1)` references and their `[↩︎](#fnref1)` backlinks.
 */
export function unwrapFragmentLinks(html: string): string {
  return html.replace(
    /<a\s[^>]*href=["']#[^"']*["'][^>]*>([\s\S]*?)<\/a>/g,
    (_match, inner) => inner
  )
}

/**
 * Adds an inline style to `<a>` tags lacking one: dark text with a
 * newsletter-accent-colored underline, matching the website's link treatment.
 */
export function styleContentLinks(
  html: string,
  newsletter?: NewsletterSlug
): string {
  const accent = newsletter ? accentColors[newsletter] : DEFAULT_ACCENT
  const style = `color: #3B3834; text-decoration: underline; text-decoration-color: ${accent}; text-underline-offset: 2px;`
  return html.replace(/<a ([^>]*?)>/g, (match, attrs) =>
    attrs.includes('style=') ? match : `<a style="${style}" ${attrs}>`
  )
}

/** Constrains `<img>` tags lacking a style so they don't overflow narrow panes. */
export function styleContentImages(html: string): string {
  return html.replace(/<img ([^>]*?)>/g, (match, attrs) =>
    attrs.includes('style=')
      ? match
      : `<img style="max-width: 100%; height: auto; display: block;" ${attrs}>`
  )
}

/**
 * Applies the body transforms: dead fragment anchors are unwrapped first, then
 * the three printing-press transforms run in the order printing-press used.
 */
export function transformEmailBody(
  html: string,
  newsletter?: NewsletterSlug
): string {
  return styleContentImages(
    styleContentLinks(
      resolveRelativeUrls(unwrapFragmentLinks(html)),
      newsletter
    )
  )
}
