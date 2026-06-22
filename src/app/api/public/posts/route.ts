import type { NextRequest } from 'next/server'
import { publicError, publicJson, publicOptions } from '@/lib/public-api/http'
import { listPublicPosts } from '@/lib/public-api/posts'

export function OPTIONS() {
  return publicOptions()
}

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  try {
    return publicJson(
      listPublicPosts({
        newsletter: searchParams.get('newsletter') ?? undefined,
        limit: searchParams.get('limit') ?? undefined,
        cursor: searchParams.get('cursor') ?? undefined,
      })
    )
  } catch (error) {
    return publicError(error)
  }
}
