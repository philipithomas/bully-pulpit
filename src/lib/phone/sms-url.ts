import { siteConfig } from '@/lib/config'

const PRODUCTION_WWW_HOST = 'www.philipithomas.com'
const PRODUCTION_APEX_HOST = 'philipithomas.com'
const PRODUCTION_WWW_URL =
  /https:\/\/www\.philipithomas\.com(?=\/|[?#\s)\],!;:'"]|\.(?![a-z0-9-])|$)/gi

/** Short first-party origin for links visible inside text-message bodies. */
export function smsSiteOrigin(): string {
  const url = new URL(siteConfig.url)
  if (url.hostname === PRODUCTION_WWW_HOST) {
    url.hostname = PRODUCTION_APEX_HOST
  }
  return url.origin
}

/** Shortens absolute first-party links without rewriting lookalike hosts. */
export function normalizeSmsSiteUrls(value: string): string {
  return value.replace(PRODUCTION_WWW_URL, 'https://philipithomas.com')
}
