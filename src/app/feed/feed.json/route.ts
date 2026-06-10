import { NextResponse } from 'next/server'
import { getAllPosts } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'
import { COMBINED_FEED_ITEM_LIMIT } from '@/lib/feeds/render'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getAllPosts()
  return NextResponse.json(
    await generateJsonFeed(posts, { limit: COMBINED_FEED_ITEM_LIMIT })
  )
}
