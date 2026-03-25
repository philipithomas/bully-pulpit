import type { NextConfig } from 'next'
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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io https://telegraph.contraption.co",
      "style-src 'self' 'unsafe-inline' https://fonts.philipithomas.com",
      "font-src 'self' https://fonts.philipithomas.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://plausible.io https://telegraph.contraption.co",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2678400,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Static pages — CDN caches 1 hour, browser caches 10 min, serve stale while revalidating
      {
        source: '/:path((?!api|_next|feed|sitemap|robots|llms).*)',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
      // Hashed _next/static assets — immutable, cache forever
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Optimized images from _next/image — cache 30 days
      {
        source: '/_next/image(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2678400, stale-while-revalidate=86400',
          },
        ],
      },
      // RSS/JSON feeds — CDN caches 1 hour
      {
        source: '/feed/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value:
              'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
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

export default nextConfig
