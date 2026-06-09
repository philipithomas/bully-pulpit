import { siteConfig } from '@/lib/config'
import { getRelatedPosts } from '@/lib/content/related'
import {
  markdownToPlaintext,
  renderEmailHeaderHtml,
  renderMarkdownToHtml,
  renderRelatedPostsHtml,
} from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'

export type EmailBody = {
  subject: string
  subtitle: string | null
  html: string
  previewText: string
  /** Full plaintext rendering of the body, for the email's text/plain part. */
  bodyText: string
}

/**
 * Builds the inner email body (header + rendered markdown + related posts) and
 * its preview text for a post. Single source of truth shared by the public
 * posts API route and the newsletter send pipeline.
 */
export async function buildEmailBodyHtml(post: Post): Promise<EmailBody> {
  const relatedPosts = getRelatedPosts(post.slug)
  const markdownHtml = await renderMarkdownToHtml(post.content)
  const relatedPostsHtml = renderRelatedPostsHtml(relatedPosts, siteConfig.url)
  const subtitle =
    post.frontmatter.subtitle || post.frontmatter.description || null
  const emailHeader = renderEmailHeaderHtml(
    post.frontmatter.title,
    siteConfig.url,
    post.slug,
    subtitle,
    post.frontmatter.coverImage,
    post.frontmatter.coverImageAlt,
    post.newsletter === 'postcard' ? null : post.frontmatter.publishedAt
  )
  const html = emailHeader + markdownHtml + relatedPostsHtml
  // Short snippet for the preheader/preview; full text for the text/plain part.
  const bodyPreview = markdownToPlaintext(post.content)
  const bodyText = markdownToPlaintext(post.content, 100_000, {
    preserveParagraphs: true,
  })
  const previewText = subtitle ? `${subtitle} – ${bodyPreview}` : bodyPreview
  return {
    subject: post.frontmatter.title,
    subtitle,
    html,
    previewText,
    bodyText,
  }
}
