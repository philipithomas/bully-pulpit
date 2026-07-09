import { describe, expect, it } from 'vitest'
import { GET } from '@/app/sitemap.xml/route'
import { siteConfig } from '@/lib/config'
import { publicAppPages } from '@/lib/public-pages'

describe('sitemap.xml public app pages', () => {
  it('includes every registry page marked for the XML sitemap', async () => {
    const response = await GET()
    const xml = await response.text()

    for (const page of publicAppPages.filter((entry) => entry.xmlSitemap)) {
      const path = page.path === '/' ? '' : page.path
      expect(xml).toContain(`<loc>${siteConfig.url}${path}</loc>`)
    }
  })
})
