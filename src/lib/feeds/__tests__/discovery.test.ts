import { describe, expect, it } from 'vitest'
import { siteConfig } from '@/lib/config'
import { NEWSLETTERS } from '@/lib/content/types'
import { feedDiscovery } from '@/lib/feeds/discovery'

const allFeedTitle = 'Philip I. Thomas: all posts'

describe('feedDiscovery', () => {
  it('site-wide discovery lists the combined feed first, then every newsletter', () => {
    const types = feedDiscovery()
    const rss = types?.['application/rss+xml']
    expect(rss).toEqual([
      { url: '/feed/rss.xml', title: allFeedTitle },
      ...NEWSLETTERS.map((newsletter) => ({
        url: `/feed/${newsletter}/rss.xml`,
        title: siteConfig.newsletters[newsletter].name,
      })),
    ])
  })

  it('site-wide discovery includes JSON feed variants', () => {
    const types = feedDiscovery()
    const json = types?.['application/feed+json']
    expect(json).toEqual([
      { url: '/feed/feed.json', title: allFeedTitle },
      ...NEWSLETTERS.map((newsletter) => ({
        url: `/feed/${newsletter}/feed.json`,
        title: siteConfig.newsletters[newsletter].name,
      })),
    ])
  })

  it('newsletter-scoped discovery leads with the newsletter feed plus the combined one', () => {
    const types = feedDiscovery('workshop')
    expect(types?.['application/rss+xml']).toEqual([
      { url: '/feed/workshop/rss.xml', title: 'Workshop' },
      { url: '/feed/rss.xml', title: allFeedTitle },
    ])
    expect(types?.['application/feed+json']).toEqual([
      { url: '/feed/workshop/feed.json', title: 'Workshop' },
      { url: '/feed/feed.json', title: allFeedTitle },
    ])
  })
})
