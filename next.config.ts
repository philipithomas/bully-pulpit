import type { NextConfig } from 'next'

// Postcard redirects: /posts/what-i-m-up-to-{month}-{year} -> /{month}-{year}
const postcardMonths = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const postcardYears = [2022, 2023, 2024, 2025, 2026, 2027, 2028]
const postcardRedirects = postcardYears.flatMap((year) =>
  postcardMonths.map((month) => ({
    source: `/posts/what-i-m-up-to-${month}-${year}`,
    destination: `/${month}-${year}`,
    permanent: true,
  }))
)

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
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
    return [
      // Postcard: /posts/what-i-m-up-to-{month}-{year} -> /{month}-{year}
      ...postcardRedirects,
      // All other old philipithomas.com posts: /posts/:slug -> /:slug
      {
        source: '/posts/:slug',
        destination: '/:slug',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
