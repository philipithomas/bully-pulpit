import { NextResponse } from 'next/server'
import { getAllPosts, getPostBySlug } from '@/lib/content/loader'
import { getRelatedPosts } from '@/lib/content/related'

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const relatedPosts = getRelatedPosts(slug)

  return NextResponse.json({
    slug,
    related: relatedPosts.map((p) => ({
      slug: p.slug,
      title: p.frontmatter.title,
      newsletter: p.newsletter,
      published_at: p.frontmatter.publishedAt,
      cover_image: p.frontmatter.coverImage || null,
      excerpt: p.excerpt,
    })),
  })
}
