import { describe, expect, it } from 'vitest'
import { getAllPosts, getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'
import { generateRss } from '@/lib/feeds/rss'

describe('RSS feed', () => {
  it('generates valid RSS with all posts', () => {
    const posts = getAllPosts()
    const rss = generateRss(posts)
    expect(rss).toContain('<?xml version="1.0"')
    expect(rss).toContain('<rss version="2.0"')
    expect(rss).toContain('<item>')
    // All 3 newsletters represented
    for (const post of posts) {
      expect(rss).toContain(post.frontmatter.title)
    }
  })

  it('generates RSS per newsletter', () => {
    for (const nl of ['contraption', 'workshop', 'postcard'] as const) {
      const posts = getPostsByNewsletter(nl)
      const rss = generateRss(posts)
      expect(rss).toContain('<item>')
    }
  })
})

describe('JSON feed', () => {
  it('generates valid JSON feed with all posts', () => {
    const posts = getAllPosts()
    const feed = generateJsonFeed(posts)
    expect(feed.version).toBe('https://jsonfeed.org/version/1.1')
    expect(feed.items.length).toBeGreaterThan(0)
    // All 3 newsletters represented
    const tags = new Set(feed.items.flatMap((i) => i.tags))
    expect(tags.has('contraption')).toBe(true)
    expect(tags.has('workshop')).toBe(true)
    expect(tags.has('postcard')).toBe(true)
  })

  it('generates JSON feed per newsletter', () => {
    for (const nl of ['contraption', 'workshop', 'postcard'] as const) {
      const posts = getPostsByNewsletter(nl)
      const feed = generateJsonFeed(posts)
      expect(feed.items.length).toBeGreaterThan(0)
      for (const item of feed.items) {
        expect(item.tags).toContain(nl)
      }
    }
  })
})
