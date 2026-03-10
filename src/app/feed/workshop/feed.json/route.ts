import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export async function GET() {
  const posts = getPostsByNewsletter('workshop')
  return NextResponse.json(
    generateJsonFeed(
      posts,
      `${siteConfig.newsletters.workshop.name} | ${siteConfig.title}`,
      `${siteConfig.url}/feed/workshop/feed.json`
    )
  )
}
