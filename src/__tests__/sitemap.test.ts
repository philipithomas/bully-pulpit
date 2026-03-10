import { describe, expect, it } from 'vitest'
import { getAllPosts, getPages } from '@/lib/content/loader'

describe('sitemap', () => {
  it('all posts have slugs for sitemap', () => {
    const posts = getAllPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(post.slug).toBeTruthy()
      expect(post.slug).not.toContain(' ')
    }
  })

  it('all pages have slugs for sitemap', () => {
    const pages = getPages()
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      expect(page.slug).toBeTruthy()
      expect(page.slug).not.toContain(' ')
    }
  })

  it('terms and privacy pages exist', () => {
    const pages = getPages()
    const slugs = pages.map((p) => p.slug)
    expect(slugs).toContain('terms')
    expect(slugs).toContain('privacy')
  })

  it('no slug collisions between posts and pages', () => {
    const posts = getAllPosts()
    const pages = getPages()
    const postSlugs = new Set(posts.map((p) => p.slug))
    for (const page of pages) {
      expect(postSlugs.has(page.slug)).toBe(false)
    }
  })
})
