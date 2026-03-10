import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export async function GET() {
  const posts = getPostsByNewsletter('workshop')
  const xml = generateRss(
    posts,
    `${siteConfig.newsletters.workshop.name} | ${siteConfig.title}`,
    `${siteConfig.url}/feed/workshop/rss.xml`
  )
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
