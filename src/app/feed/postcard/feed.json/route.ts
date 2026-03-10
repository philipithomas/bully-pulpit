import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostsByNewsletter } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export async function GET() {
  const posts = getPostsByNewsletter('postcard')
  return NextResponse.json(
    generateJsonFeed(
      posts,
      `${siteConfig.newsletters.postcard.name} | ${siteConfig.title}`,
      `${siteConfig.url}/feed/postcard/feed.json`
    )
  )
}
