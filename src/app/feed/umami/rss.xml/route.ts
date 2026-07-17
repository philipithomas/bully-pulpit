import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('umami')
  const xml = await generateRss(posts, {
    title: `${siteConfig.newsletters.umami.name} | ${siteConfig.title}`,
    description: siteConfig.newsletters.umami.tagline,
    feedUrl: `${siteConfig.url}/feed/umami/rss.xml`,
  })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
