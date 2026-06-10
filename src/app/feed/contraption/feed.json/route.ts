import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('contraption')
  return NextResponse.json(
    await generateJsonFeed(posts, {
      title: `${siteConfig.newsletters.contraption.name} | ${siteConfig.title}`,
      description: siteConfig.newsletters.contraption.tagline,
      feedUrl: `${siteConfig.url}/feed/contraption/feed.json`,
    })
  )
}
