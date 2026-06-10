import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('postcard')
  const xml = await generateRss(posts, {
    title: `${siteConfig.newsletters.postcard.name} | ${siteConfig.title}`,
    description: siteConfig.newsletters.postcard.tagline,
    feedUrl: `${siteConfig.url}/feed/postcard/rss.xml`,
  })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
