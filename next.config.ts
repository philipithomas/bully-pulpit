import type { NextConfig } from 'next'

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

// Ghost legacy: /posts/what-i-m-up-to-{month}-{year} -> /{year}-{mm}
// Old slug format: /{month}-{year} -> /{year}-{mm}
const postcardRedirects = postcardYears.flatMap((year) =>
  postcardMonths.map((month, i) => {
    const mm = String(i + 1).padStart(2, '0')
    return [
      {
        source: `/posts/what-i-m-up-to-${month}-${year}`,
        destination: `/${year}-${mm}`,
        permanent: true,
      },
      {
        source: `/${month}-${year}`,
        destination: `/${year}-${mm}`,
        permanent: true,
      },
    ]
  })
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
      // Ghost legacy: /posts index -> /contraption
      {
        source: '/posts',
        destination: '/contraption',
        permanent: true,
      },
      // Postcard redirects (Ghost legacy + old month-name slugs)
      ...postcardRedirects.flat(),
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
