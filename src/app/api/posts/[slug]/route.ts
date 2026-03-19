import { type NextRequest, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { getPostBySlug } from '@/lib/content/loader'
import { getRelatedPosts } from '@/lib/content/related'
import {
  markdownToPlaintext,
  renderEmailHeaderHtml,
  renderMarkdownToHtml,
  renderRelatedPostsHtml,
} from '@/lib/content/render-html'

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
  const markdownHtml = await renderMarkdownToHtml(post.content)
  const relatedPostsHtml = renderRelatedPostsHtml(relatedPosts, siteConfig.url)
  const subtitle =
    post.frontmatter.subtitle || post.frontmatter.description || null
  const emailHeader = renderEmailHeaderHtml(
    post.frontmatter.title,
    siteConfig.url,
    slug,
    subtitle,
    post.frontmatter.coverImage,
    post.frontmatter.coverImageAlt,
    post.newsletter === 'postcard' ? null : post.frontmatter.publishedAt
  )
  const emailHtml = emailHeader + markdownHtml + relatedPostsHtml

  const bodyPlaintext = markdownToPlaintext(post.content)
  const previewText = subtitle
    ? `${subtitle} – ${bodyPlaintext}`
    : bodyPlaintext

  return NextResponse.json({
    title: post.frontmatter.title,
    newsletter: post.newsletter,
    published_at: post.frontmatter.publishedAt,
    subtitle: subtitle,
    preview_text: previewText,
    cover_image: post.frontmatter.coverImage || null,
    cover_image_alt: post.frontmatter.coverImageAlt || null,
    email_html: emailHtml,
    related_posts: relatedPosts.map((p) => ({
      slug: p.slug,
      title: p.frontmatter.title,
      newsletter: p.newsletter,
      cover_image: p.frontmatter.coverImage || null,
      excerpt: p.excerpt,
    })),
  })
}
