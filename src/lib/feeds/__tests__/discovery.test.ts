import { describe, expect, it } from 'vitest'
import { feedDiscovery } from '@/lib/feeds/discovery'

describe('feedDiscovery', () => {
  it('site-wide discovery lists the combined feed first, then every newsletter', () => {
    const types = feedDiscovery()
    const rss = types?.['application/rss+xml']
    expect(rss).toEqual([
      { url: '/feed/rss.xml', title: 'Philip I. Thomas: all posts' },
      { url: '/feed/contraption/rss.xml', title: 'Contraption' },
      { url: '/feed/workshop/rss.xml', title: 'Workshop' },
      { url: '/feed/postcard/rss.xml', title: 'Postcard' },
    ])
  })

  it('site-wide discovery includes JSON feed variants', () => {
    const types = feedDiscovery()
    const json = types?.['application/feed+json']
    expect(json).toEqual([
      { url: '/feed/feed.json', title: 'Philip I. Thomas: all posts' },
      { url: '/feed/contraption/feed.json', title: 'Contraption' },
      { url: '/feed/workshop/feed.json', title: 'Workshop' },
      { url: '/feed/postcard/feed.json', title: 'Postcard' },
    ])
  })

  it('newsletter-scoped discovery leads with the newsletter feed plus the combined one', () => {
    const types = feedDiscovery('workshop')
    expect(types?.['application/rss+xml']).toEqual([
      { url: '/feed/workshop/rss.xml', title: 'Workshop' },
      { url: '/feed/rss.xml', title: 'Philip I. Thomas: all posts' },
    ])
    expect(types?.['application/feed+json']).toEqual([
      { url: '/feed/workshop/feed.json', title: 'Workshop' },
      { url: '/feed/feed.json', title: 'Philip I. Thomas: all posts' },
    ])
  })
})
