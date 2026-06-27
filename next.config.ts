import { withBotId } from 'botid/next/config'
import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'
import { getRedirects } from '@/lib/redirects'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.philipithomas.com",
      "font-src 'self' https://fonts.philipithomas.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://cloudflareinsights.com https://accounts.google.com https://oauth2.googleapis.com",
      // 'self' is required by Vercel BotID/Kasada, which frames its bot-check
      // challenge from a same-origin /…/fp path (withBotId proxies it first-party).
      "frame-src 'self' https://accounts.google.com https://www.google.com https://www.youtube.com https://open.spotify.com https://podcasters.spotify.com",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    qualities: [100],
    minimumCacheTTL: 2678400,
    // 1920 stays: the post hero renders 1280px CSS (100vw under 1312px), so
    // 1x desktops need 1280 and 2x prose images need 1344 — both select 1920.
    // 2048 dropped: it only served as the ceiling for >=2x heroes (2560 px
    // needed), which 1920 now caps at a ~6% linear resolution cost for ~12%
    // fewer bytes and one fewer variant per cover.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Static pages — CDN caches 1 hour, browser caches 10 min, serve stale
      // while revalidating. Excludes sitemap.xml only, so the human sitemap
      // page at /sitemap is cached like any other static page.
      {
        source: '/:path((?!api|_next|feed|sitemap\\.xml|robots|llms).*)',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      // Static images — long browser cache with stale-while-revalidate so
      // repeat visits skip the revalidation round trip (sources keep their
      // filenames, so bound freshness at a day instead of immutable)
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=2592000',
          },
        ],
      },
      // RSS/JSON feeds — CDN caches 1 hour; noindex keeps the feed XML/JSON
      // out of search results without blocking feed readers
      {
        source: '/feed/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex',
          },
        ],
      },
      // Sitemap, robots, llms.txt — CDN caches 1 hour
      {
        source: '/:path(sitemap\\.xml|robots\\.txt|llms\\.txt)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=600, s-maxage=3600',
          },
        ],
      },
      // Static JSON APIs (recent posts, related posts) — CDN caches 1 hour
      {
        source: '/api/posts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      // Auth APIs — never cache
      {
        source: '/api/auth/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store',
          },
        ],
      },
      // Search API — short CDN cache for repeated queries
      {
        source: '/api/search',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, s-maxage=300',
          },
        ],
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/:slug(.*)\\.md',
        destination: '/api/md/:slug',
      },
    ]
  },
  async redirects() {
    return getRedirects()
  },
}

export default withWorkflow(withBotId(nextConfig))
