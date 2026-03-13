import { NextResponse } from 'next/server'
import { getAllPosts } from '@/lib/content/loader'

export const dynamic = 'force-static'

export function GET() {
  const posts = getAllPosts().slice(0, 8)

  return NextResponse.json({
    posts: posts.map((p) => ({
      slug: p.slug,
      newsletter: p.newsletter,
      title: p.frontmatter.title,
      coverImage: p.frontmatter.coverImage,
    })),
  })
}
