import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getPostsByNewsletter('postcard')
  return NextResponse.json(
    await generateJsonFeed(posts, {
      title: `${siteConfig.newsletters.postcard.name} | ${siteConfig.title}`,
      description: siteConfig.newsletters.postcard.tagline,
      feedUrl: `${siteConfig.url}/feed/postcard/feed.json`,
    })
  )
}
