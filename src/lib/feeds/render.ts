import { siteConfig } from '@/lib/config'
import {
  markdownToPlaintext,
  renderMarkdownToHtml,
} from '@/lib/content/render-html'
import type { Post } from '@/lib/content/types'
import { resolveRelativeUrls } from '@/lib/email/content-transforms'
import { escapeHtml } from '@/lib/email/escape'
import {
  type ExtractedYouTubeEmbed,
  extractYouTubeEmbeds,
  restoreYouTubeEmbedsAsHtml,
} from '@/lib/email/youtube-embeds'

/** Options shared by the RSS and JSON Feed generators. */
export type FeedOptions = {
  title?: string
  description?: string
  feedUrl?: string
  /** Cap on item count; the combined feeds use this to bound feed size. */
  limit?: number
}

/**
 * Item cap for the combined feeds. Full content for all 123+ posts produces
 * a multi-hundred-kilobyte download that every reader re-fetches on poll, so
 * the combined feeds carry the most recent posts only. The per-newsletter
 * feeds stay complete.
 */
export const COMBINED_FEED_ITEM_LIMIT = 30

// Plain markup for one YouTube embed: a linked thumbnail and a caption link,
// no inline styles. Feed readers cannot be assumed to play iframes, so this
// mirrors the email idiom in semantic HTML.
function renderEmbedHtml(embed: ExtractedYouTubeEmbed): string {
  const url = `https://www.youtube.com/watch?v=${embed.videoId}`
  const alt = escapeHtml(embed.title ?? 'YouTube video')
  const caption = embed.title
    ? `Watch on YouTube: ${escapeHtml(embed.title)}`
    : 'Watch on YouTube'
  return (
    `<p><a href="${url}"><img src="https://i.ytimg.com/vi/${embed.videoId}/hqdefault.jpg" alt="${alt}" width="480" height="360"></a></p>` +
    `<p><a href="${url}">${caption}</a></p>`
  )
}

/**
 * Renders a post's full content for feed consumption: clean semantic HTML
 * with no inline styles (readers supply their own typography), YouTube
 * embeds as linked thumbnails, and relative URLs absolutized against the
 * site URL because feed items render with no base URL.
 */
export async function renderPostContentHtml(post: Post): Promise<string> {
  const { markdown, embeds } = extractYouTubeEmbeds(post.content)
  const html = await renderMarkdownToHtml(markdown, { inlineStyles: false })
  return resolveRelativeUrls(
    restoreYouTubeEmbedsAsHtml(html, embeds, renderEmbedHtml),
    siteConfig.url
  )
}

const SUMMARY_MAX_LENGTH = 280
// A sentence ends with terminal punctuation, optionally wrapped by a closing
// quote or bracket, followed by whitespace or the end of the text.
const SENTENCE_END = /[.!?]["')\]]?(?=\s|$)/g

/**
 * Truncates plain text at the last sentence boundary that fits within
 * `maxLength`. When not even the first sentence fits, falls back to the last
 * word boundary with an ellipsis rather than cutting mid-word.
 */
export function truncateAtSentenceBoundary(
  text: string,
  maxLength = SUMMARY_MAX_LENGTH
): string {
  if (text.length <= maxLength) return text
  const window = text.slice(0, maxLength)
  let end = -1
  for (const match of window.matchAll(SENTENCE_END)) {
    end = match.index + match[0].length
  }
  if (end > 0) return window.slice(0, end)
  const lastSpace = window.lastIndexOf(' ')
  return `${window.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}...`
}

/**
 * Plain-text summary for a feed item: the hand-written frontmatter
 * description when one exists, otherwise an excerpt of the body that ends on
 * a sentence boundary instead of mid-sentence.
 */
export function feedSummary(post: Post): string {
  if (post.frontmatter.description) return post.frontmatter.description
  return truncateAtSentenceBoundary(markdownToPlaintext(post.content, 2000))
}
