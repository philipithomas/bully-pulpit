import { describe, expect, it } from 'vitest'
import { GET } from '@/app/sitemap.xml/route'
import { siteConfig } from '@/lib/config'
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

describe('sitemap.xml route', () => {
  async function getSitemapXml(): Promise<string> {
    const response = await GET()
    expect(response.headers.get('Content-Type')).toContain('application/xml')
    return response.text()
  }

  it('lists the homepage, newsletter indexes, and static pages', async () => {
    const xml = await getSitemapXml()
    for (const path of [
      '',
      '/contraption',
      '/workshop',
      '/postcard',
      '/sitemap',
      '/print',
      '/photography',
      '/mcp',
      '/api',
    ]) {
      expect(xml).toContain(`<loc>${siteConfig.url}${path}</loc>`)
    }
  })

  it('lists every post with a lastmod date', async () => {
    const xml = await getSitemapXml()
    for (const post of getAllPosts()) {
      const lastmod = new Date(post.frontmatter.publishedAt).toISOString()
      expect(xml).toContain(
        `<url><loc>${siteConfig.url}/${post.slug}</loc><lastmod>${lastmod}</lastmod></url>`
      )
    }
  })

  it('excludes the policy pages', async () => {
    const xml = await getSitemapXml()
    for (const slug of ['terms', 'privacy', 'policies']) {
      expect(xml).not.toContain(`<loc>${siteConfig.url}/${slug}</loc>`)
    }
  })

  it('lists the remaining content pages', async () => {
    const xml = await getSitemapXml()
    const excluded = new Set(['terms', 'privacy', 'policies'])
    const remaining = getPages().filter((p) => !excluded.has(p.slug))
    expect(remaining.length).toBeGreaterThan(0)
    for (const page of remaining) {
      expect(xml).toContain(`<loc>${siteConfig.url}/${page.slug}</loc>`)
    }
  })
})
