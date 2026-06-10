import { describe, expect, it } from 'vitest'
import { GET } from '@/app/robots.txt/route'
import { siteConfig } from '@/lib/config'

describe('robots.txt route', () => {
  async function getRobotsTxt(): Promise<string> {
    const response = await GET()
    expect(response.headers.get('Content-Type')).toContain('text/plain')
    return response.text()
  }

  it('disallows the admin panel and API routes', async () => {
    const body = await getRobotsTxt()
    expect(body).toContain('Disallow: /printing-press')
    expect(body).toContain('Disallow: /admin')
    expect(body).toContain('Disallow: /api/')
  })

  it('keeps the rest of the site crawlable', async () => {
    const body = await getRobotsTxt()
    expect(body).toContain('Allow: /')
    // Noindexed transactional pages must stay crawlable so the meta tag is
    // visible to crawlers.
    expect(body).not.toContain('Disallow: /unsubscribe')
    expect(body).not.toContain('Disallow: /account')
  })

  it('references the sitemap', async () => {
    const body = await getRobotsTxt()
    expect(body).toContain(`Sitemap: ${siteConfig.url}/sitemap.xml`)
  })
})
