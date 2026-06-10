import { getAllPosts } from '@/lib/content/loader'
import { COMBINED_FEED_ITEM_LIMIT } from '@/lib/feeds/render'
import { generateRss } from '@/lib/feeds/rss'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getAllPosts()
  const xml = await generateRss(posts, { limit: COMBINED_FEED_ITEM_LIMIT })
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
