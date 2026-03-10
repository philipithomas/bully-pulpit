import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getAllPosts, getPostsByNewsletter } from '@/lib/content/loader'
import { newsletterSchema } from '@/lib/content/types'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const newsletter = searchParams.get('newsletter')
  const page = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const limit = Number.parseInt(searchParams.get('limit') ?? '24', 10)

  let posts =
    newsletter && newsletterSchema.safeParse(newsletter).success
      ? getPostsByNewsletter(newsletterSchema.parse(newsletter))
      : getAllPosts()

  const total = posts.length
  const offset = (page - 1) * limit
  posts = posts.slice(offset, offset + limit)

  return NextResponse.json({
    posts: posts.map((p) => ({
      slug: p.slug,
      newsletter: p.newsletter,
      title: p.frontmatter.title,
      description: p.frontmatter.description,
      publishedAt: p.frontmatter.publishedAt,
      coverImage: p.frontmatter.coverImage,
      excerpt: p.excerpt,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}
