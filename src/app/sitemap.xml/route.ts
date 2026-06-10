import { siteConfig } from '@/lib/config'
import { getAllPosts, getPages } from '@/lib/content/loader'

// Policy pages stay indexable but are not advertised in the sitemap.
const EXCLUDED_PAGE_SLUGS = new Set(['terms', 'privacy', 'policies'])

export async function GET() {
  const posts = getAllPosts()
  const pages = getPages().filter((p) => !EXCLUDED_PAGE_SLUGS.has(p.slug))

  const staticPages = [
    '',
    '/contraption',
    '/workshop',
    '/postcard',
    '/print',
    '/photography',
  ]

  const urls = [
    ...staticPages.map((p) => `  <url><loc>${siteConfig.url}${p}</loc></url>`),
    ...posts.map(
      (p) =>
        `  <url><loc>${siteConfig.url}/${p.slug}</loc><lastmod>${new Date(p.frontmatter.publishedAt).toISOString()}</lastmod></url>`
    ),
    ...pages.map((p) => `  <url><loc>${siteConfig.url}/${p.slug}</loc></url>`),
  ].join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
