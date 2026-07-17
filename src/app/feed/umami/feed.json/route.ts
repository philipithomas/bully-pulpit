import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('umami')
  return NextResponse.json(
    await generateJsonFeed(posts, {
      title: `${siteConfig.newsletters.umami.name} | ${siteConfig.title}`,
      description: siteConfig.newsletters.umami.tagline,
      feedUrl: `${siteConfig.url}/feed/umami/feed.json`,
    })
  )
}
