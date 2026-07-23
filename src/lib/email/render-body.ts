import { siteConfig } from '@/lib/config'
import { photoMetadataText } from '@/lib/content/photo-metadata'
import { getRelatedPostsForEmail } from '@/lib/content/related-email'
import {
  markdownToPlaintext,
  renderEmailHeaderHtml,
  renderMarkdownToHtml,
  renderRelatedPostsHtml,
} from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import {
  extractYouTubeEmbeds,
  restoreYouTubeEmbedsAsHtml,
  restoreYouTubeEmbedsAsText,
} from '@/lib/email/youtube-embeds'
import { isPhotoNewsletter } from '@/lib/newsletters'

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
  const relatedPosts = isPhotoNewsletter(post.newsletter)
    ? []
    : getRelatedPostsForEmail(post.slug)
  // Emails cannot play iframes: each YouTube embed becomes a clickable
  // thumbnail in the HTML part and a watch link in the text part.
  const { markdown: emailSource, embeds } = extractYouTubeEmbeds(post.content)
  const markdownHtml = restoreYouTubeEmbedsAsHtml(
    await renderMarkdownToHtml(emailSource),
    embeds
  )
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
    post.newsletter === 'postcard' ? null : post.frontmatter.publishedAt,
    post.frontmatter.location,
    post.frontmatter.photo
  )
  const html = emailHeader + markdownHtml + relatedPostsHtml
  // Short snippet for the preheader/preview; full text for the text/plain
  // part. The preview renders from the original source so the preheader stays
  // prose (embeds are stripped there, not turned into watch links).
  const bodyPreview = markdownToPlaintext(post.content)
  const renderedBodyText = restoreYouTubeEmbedsAsText(
    markdownToPlaintext(emailSource, 100_000, { preserveParagraphs: true }),
    embeds
  )
  const fallbackBodyText = [
    post.frontmatter.title,
    post.newsletter === 'postcard' ? null : post.frontmatter.publishedAt,
    post.frontmatter.location?.name,
    `${siteConfig.url}/${post.slug}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n')
  const photoText = photoMetadataText(post.frontmatter.photo)
  const bodyText = renderedBodyText
    ? [photoText, renderedBodyText].filter(Boolean).join('\n\n')
    : [fallbackBodyText, photoText].filter(Boolean).join('\n')
  const previewFallback =
    post.frontmatter.coverImageAlt ?? post.frontmatter.title
  const previewText = subtitle
    ? bodyPreview
      ? `${subtitle} – ${bodyPreview}`
      : subtitle
    : bodyPreview || previewFallback
  return {
    subject: post.frontmatter.title,
    subtitle,
    html,
    previewText,
    bodyText,
  }
}
