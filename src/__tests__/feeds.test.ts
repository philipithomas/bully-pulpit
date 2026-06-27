import { describe, expect, it } from 'vitest'
import { siteConfig } from '@/lib/config'
import { getAllPosts, getPostsByNewsletter } from '@/lib/content/loader'
import { NEWSLETTERS, type Post } from '@/lib/content/types'
import { generateJsonFeed } from '@/lib/feeds/json-feed'
import { COMBINED_FEED_ITEM_LIMIT } from '@/lib/feeds/render'
import { generateRss } from '@/lib/feeds/rss'

// Rendering the full post corpus to HTML is several seconds of work, which can
// cross the default 5s per-test timeout when the suite runs files in parallel.
const FULL_CORPUS_TIMEOUT = 30_000

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    slug: 'test-post',
    newsletter: 'workshop',
    frontmatter: {
      title: 'Test post',
      publishedAt: '2026-01-01',
      featured: false,
      draft: false,
    },
    content: 'A paragraph of body text.',
    excerpt: 'A paragraph of body text.',
    ...overrides,
  }
}

describe('RSS feed', () => {
  it(
    'generates valid RSS with full content per item',
    async () => {
      const posts = getAllPosts()
      const rss = await generateRss(posts, { limit: COMBINED_FEED_ITEM_LIMIT })
      expect(rss).toContain('<?xml version="1.0"')
      expect(rss).toContain('<rss version="2.0"')
      expect(rss).toContain(
        'xmlns:content="http://purl.org/rss/1.0/modules/content/"'
      )
      const itemCount = (rss.match(/<item>/g) ?? []).length
      expect(itemCount).toBe(COMBINED_FEED_ITEM_LIMIT)
      expect((rss.match(/<content:encoded>/g) ?? []).length).toBe(itemCount)
      expect((rss.match(/<description>/g) ?? []).length).toBe(itemCount + 1)
    },
    FULL_CORPUS_TIMEOUT
  )

  it('uses the site description on the combined channel', async () => {
    const rss = await generateRss(getAllPosts().slice(0, 1))
    expect(rss).toContain(
      `<description>${siteConfig.description}</description>`
    )
  })

  it(
    'generates RSS per newsletter with the tagline as description',
    async () => {
      for (const nl of NEWSLETTERS) {
        const posts = getPostsByNewsletter(nl)
        const rss = await generateRss(posts, {
          title: `${siteConfig.newsletters[nl].name} | ${siteConfig.title}`,
          description: siteConfig.newsletters[nl].tagline,
          feedUrl: `${siteConfig.url}/feed/${nl}/rss.xml`,
        })
        expect(rss).toContain(
          `<description>${siteConfig.newsletters[nl].tagline}</description>`
        )
        // Per-newsletter feeds are uncapped: every post is present.
        expect((rss.match(/<item>/g) ?? []).length).toBe(posts.length)
        for (const post of posts) {
          expect(rss).toContain(`${siteConfig.url}/${post.slug}`)
        }
      }
    },
    FULL_CORPUS_TIMEOUT
  )

  it('splits a literal ]]> so it cannot terminate the CDATA section', async () => {
    const post = makePost({
      frontmatter: {
        title: 'Title with ]]> inside',
        publishedAt: '2026-01-01',
        featured: false,
        draft: false,
      },
    })
    const rss = await generateRss([post])
    expect(rss).toContain(']]]]><![CDATA[>')
    expect(rss).not.toContain('Title with ]]> inside')
  })
})

describe('JSON feed', () => {
  it(
    'meets JSON Feed 1.1 required fields per item',
    async () => {
      const posts = getAllPosts()
      const feed = await generateJsonFeed(posts, {
        limit: COMBINED_FEED_ITEM_LIMIT,
      })
      expect(feed.version).toBe('https://jsonfeed.org/version/1.1')
      expect(feed.title).toBe(siteConfig.title)
      expect(feed.description).toBe(siteConfig.description)
      expect(feed.items.length).toBe(COMBINED_FEED_ITEM_LIMIT)
      for (const item of feed.items) {
        expect(item.id).toMatch(/^https:\/\//)
        expect(item.url).toMatch(/^https:\/\//)
        expect(item.title.length).toBeGreaterThan(0)
        // The spec requires content_html or content_text on every item.
        expect(item.content_html.length).toBeGreaterThan(0)
        expect(item.summary.length).toBeGreaterThan(0)
        expect(item.date_published).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      }
      // The feed must survive a serialization round trip unchanged.
      expect(JSON.parse(JSON.stringify(feed))).toEqual(feed)
    },
    FULL_CORPUS_TIMEOUT
  )

  it(
    'generates JSON feed per newsletter with the tagline as description',
    async () => {
      for (const nl of NEWSLETTERS) {
        const posts = getPostsByNewsletter(nl)
        const feed = await generateJsonFeed(posts, {
          title: `${siteConfig.newsletters[nl].name} | ${siteConfig.title}`,
          description: siteConfig.newsletters[nl].tagline,
          feedUrl: `${siteConfig.url}/feed/${nl}/feed.json`,
        })
        expect(feed.description).toBe(siteConfig.newsletters[nl].tagline)
        // Per-newsletter feeds are uncapped: every post is present.
        expect(feed.items.length).toBe(posts.length)
        for (const item of feed.items) {
          expect(item.tags).toContain(nl)
          expect(item.content_html.length).toBeGreaterThan(0)
        }
      }
    },
    FULL_CORPUS_TIMEOUT
  )
})
