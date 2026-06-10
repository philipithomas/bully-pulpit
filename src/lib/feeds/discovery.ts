import type { Metadata } from 'next'
import { siteConfig } from '@/lib/config'
import type { Newsletter } from '@/lib/content/types'

const NEWSLETTERS: Newsletter[] = ['contraption', 'workshop', 'postcard']

type FeedFile = 'rss.xml' | 'feed.json'

function combinedLink(file: FeedFile) {
  return {
    url: `/feed/${file}`,
    title: `${siteConfig.title}: all posts`,
  }
}

function newsletterLink(newsletter: Newsletter, file: FeedFile) {
  return {
    url: `/feed/${newsletter}/${file}`,
    title: siteConfig.newsletters[newsletter].name,
  }
}

function feedLinks(file: FeedFile, newsletter?: Newsletter) {
  if (newsletter) {
    return [newsletterLink(newsletter, file), combinedLink(file)]
  }
  return [
    combinedLink(file),
    ...NEWSLETTERS.map((n) => newsletterLink(n, file)),
  ]
}

/**
 * Feed auto-discovery links for `alternates.types`. Next.js merges metadata
 * shallowly: a page-level `alternates` key replaces the root layout's
 * entirely, so every page that sets `alternates.canonical` must restate
 * these. Site-wide pages advertise the combined feed first, then each
 * newsletter feed; pages scoped to a newsletter lead with their own feed
 * followed by the combined one.
 */
export function feedDiscovery(
  newsletter?: Newsletter
): NonNullable<Metadata['alternates']>['types'] {
  return {
    'application/rss+xml': feedLinks('rss.xml', newsletter),
    'application/feed+json': feedLinks('feed.json', newsletter),
  }
}
