import { type NextRequest, NextResponse } from 'next/server'
import { getPostBySlug } from '@/lib/content/loader'
import { renderMarkdownToHtml } from '@/lib/content/render-html'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const emailHtml = await renderMarkdownToHtml(post.content)

  return NextResponse.json({
    title: post.frontmatter.title,
    newsletter: post.newsletter,
    published_at: post.frontmatter.publishedAt,
    email_html: emailHtml,
  })
}
