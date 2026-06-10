import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('workshop')
  return NextResponse.json(
    await generateJsonFeed(posts, {
      title: `${siteConfig.newsletters.workshop.name} | ${siteConfig.title}`,
      description: siteConfig.newsletters.workshop.tagline,
      feedUrl: `${siteConfig.url}/feed/workshop/feed.json`,
    })
  )
}
