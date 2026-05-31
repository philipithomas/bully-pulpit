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
  const bodyPlaintext = markdownToPlaintext(post.content)
  const previewText = subtitle
    ? `${subtitle} – ${bodyPlaintext}`
    : bodyPlaintext
  return { subject: post.frontmatter.title, subtitle, html, previewText }
}
