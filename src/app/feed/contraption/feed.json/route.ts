import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export async function GET() {
  const posts = getPostsByNewsletter('contraption')
  return NextResponse.json(
    generateJsonFeed(
      posts,
      `${siteConfig.newsletters.contraption.name} | ${siteConfig.title}`,
      `${siteConfig.url}/feed/contraption/feed.json`
    )
  )
}
