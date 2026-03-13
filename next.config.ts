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
      // philipithomas.com legacy post redirects (explicit per-post mapping)
      {
        source: '/posts/buyers-define-marketplaces',
        destination: '/buyers-define-marketplaces',
        permanent: true,
      },
      {
        source: '/posts/moonlight-s-pitch-deck',
        destination: '/moonlight-s-pitch-deck',
        permanent: true,
      },
      {
        source: '/posts/advice-for-marketplace-startups',
        destination: '/advice-for-marketplace-startups',
        permanent: true,
      },
      {
        source: '/posts/sharing-a-project-i-built-postcard',
        destination: '/sharing-a-project-i-built-postcard',
        permanent: true,
      },
      {
        source:
          '/posts/when-are-low-code-prototypes-useful-evaluating-startup-market-and-implementation-risks',
        destination:
          '/when-are-low-code-prototypes-useful-evaluating-startup-market-and-implementation-risks',
        permanent: true,
      },
      {
        source:
          '/posts/why-i-built-postcard-a-calmer-alternative-to-social-networks',
        destination:
          '/why-i-built-postcard-a-calmer-alternative-to-social-networks',
        permanent: true,
      },
      {
        source: '/posts/how-to-replace-social-media-with-a-personal-newsletter',
        destination: '/how-to-replace-social-media-with-a-personal-newsletter',
        permanent: true,
      },
      {
        source: '/posts/slow-travel-in-paris-discovering-substance-cafe',
        destination: '/slow-travel',
        permanent: true,
      },
      // These 2 philipithomas.com posts were not migrated
      {
        source:
          '/posts/hacking-dopamine-for-entrepreneurial-success-lessons-from-neuroscience',
        destination: '/contraption',
        permanent: true,
      },
      {
        source:
          '/posts/openai-the-path-for-openai-powered-startups-and-the-ai-hype-cycle',
        destination: '/contraption',
        permanent: true,
      },
      // Catch-all fallback: /posts/:slug -> /:slug
      {
        source: '/posts/:slug',
        destination: '/:slug',
        permanent: true,
      },
      // contraption.co legacy redirects
      { source: '/projects', destination: '/', permanent: true },
      { source: '/check-email', destination: '/', permanent: true },
      { source: '/live-analytics', destination: '/', permanent: true },
      { source: '/rss', destination: '/feed/rss.xml', permanent: true },
      // Deprecated policy pages -> /policies
      { source: '/security', destination: '/policies', permanent: true },
      { source: '/copyright', destination: '/policies', permanent: true },
      { source: '/cancellation', destination: '/policies', permanent: true },
      { source: '/refund', destination: '/policies', permanent: true },
      { source: '/abuse', destination: '/policies', permanent: true },
      {
        source: '/how-we-handle-abusive-usage',
        destination: '/policies',
        permanent: true,
      },
      { source: '/recruitment', destination: '/policies', permanent: true },
      { source: '/taxes', destination: '/policies', permanent: true },
      {
        source: '/company-processors',
        destination: '/policies',
        permanent: true,
      },
      {
        source: '/booklet-subprocessors',
        destination: '/policies',
        permanent: true,
      },
      {
        source: '/postcard-subprocessors',
        destination: '/policies',
        permanent: true,
      },
      {
        source: '/ownership-booklet',
        destination: '/policies',
        permanent: true,
      },
      // /press renamed to /print
      { source: '/press', destination: '/print', permanent: true },
    ]
  },
}

export default nextConfig
