import type { NextRequest } from 'next/server'
import { publicError, publicJson, publicOptions } from '@/lib/public-api/http'
import { searchPublicPosts } from '@/lib/public-api/posts'

export function OPTIONS() {
  return publicOptions()
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  try {
    return publicJson(
      await searchPublicPosts({
        query: searchParams.get('q') ?? undefined,
        limit: searchParams.get('limit') ?? undefined,
        cursor: searchParams.get('cursor') ?? undefined,
      })
    )
  } catch (error) {
    return publicError(error)
  }
}
