type Rewrite = {
  source: string
  destination: string
}

export function getRewrites(): Rewrite[] {
  return [
    // Keep assets embedded in delivered Umami email and MMS snapshots working.
    // These must be rewrites rather than redirects: the Next image optimizer
    // and the newsletter-cover route expect the source URL itself to return an
    // image response.
    { source: '/images/umami.svg', destination: '/images/tidbits.svg' },
    {
      source: '/images/umami-icon.svg',
      destination: '/images/tidbits-icon.svg',
    },
    {
      source: '/images/umami-email.png',
      destination: '/images/tidbits-email.png',
    },
    {
      source: '/images/covers/umami/:path*',
      destination: '/images/covers/tidbits/:path*',
    },
    {
      source: '/:slug(.*)\\.md',
      destination: '/api/md/:slug',
    },
  ]
}
