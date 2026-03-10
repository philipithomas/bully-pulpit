import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export async function GET() {
  const posts = getPostsByNewsletter('contraption')
  const xml = generateRss(
    posts,
    `${siteConfig.newsletters.contraption.name} | ${siteConfig.title}`,
    `${siteConfig.url}/feed/contraption/rss.xml`
  )
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
