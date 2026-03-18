import { withBotId } from 'botid/next/config'
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
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
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

export default withBotId(nextConfig)
