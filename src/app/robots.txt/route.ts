import { siteConfig } from '@/lib/config'

export async function GET() {
  // The admin panel and API routes are blocked from crawling. Transactional
  // pages (/unsubscribe, /check-email, /account) stay crawlable so their
  // noindex meta tags can be seen.
  const body = `User-agent: *
Allow: /
Disallow: /printing-press
Disallow: /admin
Disallow: /api/

Sitemap: ${siteConfig.url}/sitemap.xml`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
