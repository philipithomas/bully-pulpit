import { getAllPosts } from '@/lib/content/loader'
import { generateRss } from '@/lib/feeds/rss'

export async function GET() {
  const posts = getAllPosts()
  const xml = generateRss(posts)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  })
}
