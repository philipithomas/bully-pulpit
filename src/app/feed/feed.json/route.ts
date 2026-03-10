import { NextResponse } from 'next/server'
import { getAllPosts } from '@/lib/content/loader'
import { generateJsonFeed } from '@/lib/feeds/json-feed'

export async function GET() {
  const posts = getAllPosts()
  return NextResponse.json(generateJsonFeed(posts))
}
