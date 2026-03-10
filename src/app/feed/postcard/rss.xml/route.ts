import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export async function GET() {
  const posts = getPostsByNewsletter('postcard')
  const xml = generateRss(
    posts,
    `${siteConfig.newsletters.postcard.name} | ${siteConfig.title}`,
    `${siteConfig.url}/feed/postcard/rss.xml`
  )
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
