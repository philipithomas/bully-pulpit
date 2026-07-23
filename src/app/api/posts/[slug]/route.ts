import { type NextRequest, NextResponse } from 'next/server'
import { getPostBySlug } from '@/lib/content/loader'
import { getRelatedPosts } from '@/lib/content/related'
import { buildEmailBodyHtml } from '@/lib/email/render-body'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const relatedPosts = getRelatedPosts(slug)
  const { subject, subtitle, html, previewText } =
    await buildEmailBodyHtml(post)

  return NextResponse.json({
    title: subject,
    newsletter: post.newsletter,
    published_at: post.frontmatter.publishedAt,
    subtitle,
    preview_text: previewText,
    cover_image: post.frontmatter.coverImage || null,
    cover_image_alt: post.frontmatter.coverImageAlt || null,
    photo: post.frontmatter.photo || null,
    email_html: html,
    related_posts: relatedPosts.map((p) => ({
      slug: p.slug,
      title: p.frontmatter.title,
      newsletter: p.newsletter,
      cover_image: p.frontmatter.coverImage || null,
      excerpt: p.excerpt,
    })),
  })
}
