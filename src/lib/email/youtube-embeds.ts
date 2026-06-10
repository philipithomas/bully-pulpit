import { escapeHtml } from '@/lib/email/escape'

// Emails cannot play iframes, so the email render path swaps each
// <YouTubeEmbed /> MDX tag for the standard newsletter idiom: a clickable
// video thumbnail linking to YouTube, plus a "Watch on YouTube" caption.
//
// Raw HTML cannot pass through renderMarkdownToHtml (remark-rehype drops raw
// nodes and rehype-sanitize would strip the styles anyway), so the transform
// is two-phase: extractYouTubeEmbeds replaces each tag in the markdown source
// with a plain-text token that survives the pipeline untouched, and the
// restore functions splice hand-built markup (or a plaintext watch line) into
// the rendered output. This matches how renderEmailHeaderHtml and
// renderRelatedPostsHtml already hand-build email HTML outside the sanitizer,
// and it keeps the web render path (the real iframe component) untouched.

export type ExtractedYouTubeEmbed = {
  /** Placeholder spliced into the markdown source in place of the JSX tag. */
  token: string
  videoId: string
  title: string | null
}

// Matches a YouTubeEmbed JSX tag, self-closing or with an explicit closing
// tag. The attribute group tolerates `>` inside quoted values and newlines
// between props.
const EMBED_TAG_PATTERN =
  /<YouTubeEmbed\b((?:"[^"]*"|'[^']*'|[^>])*?)\/?>(?:\s*<\/YouTubeEmbed\s*>)?/g

// YouTube video ids are 11 chars of [A-Za-z0-9_-] today; the range leaves
// headroom without admitting anything that is unsafe in a URL or attribute.
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/

const SERIF_STACK = `'Tiempos Text', Georgia, 'Times New Roman', serif`
// Mirrors the `a` tag style renderMarkdownToHtml inlines on content links.
const LINK_STYLE = `color: inherit; text-decoration: underline; text-decoration-color: #b1ada6;`

/** Reads a string-valued JSX prop, handling single or double quotes. */
function getStringProp(attrs: string, name: string): string | null {
  const match = attrs.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)
  )
  if (!match) return null
  return match[1] ?? match[2] ?? null
}

/**
 * Normalizes a YouTubeEmbed `video` prop to a bare video id. Accepts a bare
 * id or a youtu.be / youtube.com (watch, embed, shorts, live) URL. Returns
 * null when no safe id can be extracted.
 */
export function extractYouTubeVideoId(value: string): string | null {
  const trimmed = value.trim()
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.replace(/^(?:www|m)\./, '')
  let candidate: string | null = null
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v')
    } else {
      const pathMatch = url.pathname.match(
        /^\/(?:embed|shorts|live|v)\/([^/]+)/
      )
      candidate = pathMatch ? pathMatch[1] : null
    }
  }
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null
}

/**
 * Replaces each YouTubeEmbed JSX tag in the markdown source with a unique
 * plain-text token and records the embed it stands for. A no-op (identical
 * markdown, empty list) for posts without embeds. Tags whose `video` prop
 * yields no safe id are left in place, so they keep today's behavior of
 * being dropped downstream.
 */
export function extractYouTubeEmbeds(markdown: string): {
  markdown: string
  embeds: ExtractedYouTubeEmbed[]
} {
  const embeds: ExtractedYouTubeEmbed[] = []
  const rewritten = markdown.replace(
    EMBED_TAG_PATTERN,
    (tag, attrs: string) => {
      const video = getStringProp(attrs, 'video')
      const videoId = video ? extractYouTubeVideoId(video) : null
      if (!videoId) return tag
      const token = `%%bp-youtube-embed-${embeds.length}%%`
      embeds.push({ token, videoId, title: getStringProp(attrs, 'title') })
      return token
    }
  )
  return { markdown: rewritten, embeds }
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Email-safe markup for one embed: a linked thumbnail (hqdefault.jpg exists
 * for every video) sized and constrained like other email images, then a
 * caption line styled like other content links.
 */
function renderEmbedHtml(embed: ExtractedYouTubeEmbed): string {
  const url = watchUrl(embed.videoId)
  const alt = escapeHtml(embed.title ?? 'YouTube video')
  const caption = embed.title
    ? `Watch on YouTube: ${escapeHtml(embed.title)}`
    : 'Watch on YouTube'
  return (
    `<p style="margin: 0 0 8px;">` +
    `<a href="${url}" style="display: block; text-decoration: none;">` +
    `<img src="https://i.ytimg.com/vi/${embed.videoId}/hqdefault.jpg" alt="${alt}" width="480" height="360" style="width: 100%; max-width: 600px; height: auto; display: block;">` +
    `</a></p>` +
    `<p style="font-family: ${SERIF_STACK}; font-size: 15px; color: #625e58; line-height: 1.5; margin: 0 0 16px;">` +
    `<a href="${url}" style="${LINK_STYLE}">${caption}</a></p>`
  )
}

/**
 * Replaces each token in rendered email HTML with the linked-thumbnail
 * markup. Tokens normally render as their own paragraph, which is replaced
 * wholesale; a bare token (embed written inline in a sentence) is replaced
 * in place as a fallback. Callers with a different markup idiom (the feed
 * render path uses styleless HTML) pass their own `renderEmbed`.
 */
export function restoreYouTubeEmbedsAsHtml(
  html: string,
  embeds: ExtractedYouTubeEmbed[],
  renderEmbed: (embed: ExtractedYouTubeEmbed) => string = renderEmbedHtml
): string {
  let result = html
  for (const embed of embeds) {
    const block = renderEmbed(embed)
    const paragraph = new RegExp(`<p[^>]*>\\s*${embed.token}\\s*</p>`)
    result = paragraph.test(result)
      ? result.replace(paragraph, block)
      : result.replace(embed.token, block)
  }
  return result
}

/**
 * Replaces each token in the plaintext rendering with a watch line. Runs
 * after markdownToPlaintext so video ids with underscores cannot be mangled
 * by its bold/italic stripping.
 */
export function restoreYouTubeEmbedsAsText(
  text: string,
  embeds: ExtractedYouTubeEmbed[]
): string {
  let result = text
  for (const embed of embeds) {
    result = result.replace(
      embed.token,
      `Watch on YouTube: ${watchUrl(embed.videoId)}`
    )
  }
  return result
}
