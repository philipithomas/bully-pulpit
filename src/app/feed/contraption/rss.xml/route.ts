import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('contraption')
  const xml = await generateRss(posts, {
    title: `${siteConfig.newsletters.contraption.name} | ${siteConfig.title}`,
    description: siteConfig.newsletters.contraption.tagline,
    feedUrl: `${siteConfig.url}/feed/contraption/rss.xml`,
  })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
