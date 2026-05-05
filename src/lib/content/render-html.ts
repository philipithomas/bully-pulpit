import path from 'node:path'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { Post } from '@/lib/content/types'

const SANS_STACK = `'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
const SERIF_STACK = `'Tiempos Text', Georgia, 'Times New Roman', serif`
const MONO_STACK = `'Sohne Mono', 'SF Mono', 'Fira Code', monospace`

const tagStyles: Record<string, string> = {
  h1: `font-family: ${SANS_STACK}; font-size: 28px; font-weight: 700; color: #111110; line-height: 1.3; margin: 32px 0 12px;`,
  h2: `font-family: ${SANS_STACK}; font-size: 24px; font-weight: 700; color: #111110; line-height: 1.3; margin: 32px 0 12px;`,
  h3: `font-family: ${SANS_STACK}; font-size: 20px; font-weight: 600; color: #111110; line-height: 1.3; margin: 24px 0 8px;`,
  h4: `font-family: ${SANS_STACK}; font-size: 18px; font-weight: 600; color: #111110; line-height: 1.3; margin: 20px 0 8px;`,
  h5: `font-family: ${SANS_STACK}; font-size: 16px; font-weight: 600; color: #111110; line-height: 1.3; margin: 20px 0 8px;`,
  h6: `font-family: ${SANS_STACK}; font-size: 14px; font-weight: 600; color: #111110; line-height: 1.3; margin: 20px 0 8px;`,
  p: `font-family: ${SERIF_STACK}; font-size: 17px; font-weight: 400; color: #3b3834; line-height: 1.7; margin: 0 0 16px;`,
  ul: `font-family: ${SERIF_STACK}; font-size: 17px; color: #3b3834; line-height: 1.7; margin: 0 0 16px; padding-left: 24px;`,
  ol: `font-family: ${SERIF_STACK}; font-size: 17px; color: #3b3834; line-height: 1.7; margin: 0 0 16px; padding-left: 24px;`,
  li: `font-family: ${SERIF_STACK}; font-size: 17px; color: #3b3834; line-height: 1.7; margin: 0 0 4px;`,
  blockquote: `font-family: ${SERIF_STACK}; font-style: italic; font-size: 17px; color: #514d48; line-height: 1.7; border-left: 3px solid #cfcbc4; padding-left: 16px; margin: 16px 0;`,
  a: `color: inherit; text-decoration: underline; text-decoration-color: #b1ada6;`,
  strong: `font-weight: 700; color: #222120;`,
  em: `font-style: italic;`,
  hr: `border: 0; border-top: 1px solid #e0ddd8; margin: 32px 0;`,
  pre: `font-family: ${MONO_STACK}; font-size: 14px; background: #222120; color: #e0ddd8; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 16px 0; line-height: 1.5;`,
  code: `font-family: ${MONO_STACK}; font-size: 0.9em; background: #eceae6; color: #222120; padding: 2px 4px; border-radius: 3px;`,
  table: `font-family: ${SERIF_STACK}; font-size: 16px; color: #3b3834; border-collapse: collapse; margin: 16px 0; width: 100%;`,
  th: `font-family: ${SANS_STACK}; font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 2px solid #cfcbc4;`,
  td: `padding: 8px 12px; border-bottom: 1px solid #e0ddd8;`,
}

type HastNode = {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function applyInlineStyles() {
  return (tree: HastNode) => {
    const visit = (node: HastNode, parent: HastNode | null) => {
      if (node.type === 'element' && node.tagName) {
        const isInlineCode =
          node.tagName === 'code' && parent?.tagName !== 'pre'
        const isBlockCode = node.tagName === 'code' && parent?.tagName === 'pre'
        let style: string | undefined
        if (isBlockCode) {
          style = `font-family: ${MONO_STACK}; font-size: inherit; background: transparent; color: inherit; padding: 0;`
        } else if (isInlineCode) {
          style = tagStyles.code
        } else {
          style = tagStyles[node.tagName]
        }
        if (style) {
          node.properties = node.properties ?? {}
          const existing = node.properties.style
          node.properties.style =
            typeof existing === 'string' && existing.length > 0
              ? `${style} ${existing}`
              : style
        }
      }
      if (node.children) {
        for (const child of node.children) visit(child, node)
      }
    }
    visit(tree, null)
  }
}

function toEmailImagePath(imagePath: string): string {
  const basename = path.basename(imagePath)
  return `/images/email/covers/${basename}`
}

function toEmailThumbPath(imagePath: string): string {
  const basename = path.basename(imagePath)
  return `/images/email/thumbnails/${basename}`
}

export async function renderMarkdownToHtml(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(applyInlineStyles)
    .use(rehypeStringify)
    .process(content)

  return String(result)
}

export function renderEmailHeaderHtml(
  title: string,
  siteUrl: string,
  slug: string,
  subtitle?: string | null,
  coverImage?: string | null,
  coverImageAlt?: string | null,
  publishedAt?: string | null
): string {
  const postUrl = `${siteUrl}/${slug}`

  let html = ''

  if (publishedAt) {
    html += `<p style="font-family: 'Sohne Mono', 'SF Mono', 'Fira Code', monospace; font-size: 12px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: #7E7A73; text-align: center; margin: 0 0 12px;">${publishedAt}</p>`
  }

  html += `<h1 style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 28px; font-weight: 700; color: #111110; line-height: 1.3; text-align: center; margin: 0 0 4px;"><a href="${postUrl}" style="text-decoration: none; color: #111110;">${title}</a></h1>`

  if (subtitle) {
    html += `<p style="font-family: 'Tiempos Text', Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 400; color: #625e58; line-height: 1.75; text-align: center; margin: 0 0 4px;">${subtitle}</p>`
  }

  html += `<p style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 500; color: #625e58; text-align: center; margin: 0 0 24px;"><a href="${siteUrl}" style="color: #625e58; text-decoration: none;">Philip I. Thomas</a></p>`

  if (coverImage) {
    const emailPath = coverImage.startsWith('http')
      ? coverImage
      : `${siteUrl}${toEmailImagePath(coverImage)}`
    const alt = coverImageAlt ?? title
    html += `<img src="${emailPath}" alt="${alt}" width="600" style="width: 100%; max-width: 600px; height: auto; display: block; margin: 0 0 24px;">`
  }

  html += `<div style="font-size: 1px; line-height: 24px; height: 24px;">&nbsp;</div>`

  return html
}

export function markdownToPlaintext(markdown: string, maxLength = 150): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2') // bold/italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // inline code
    .replace(/^(?:[-*+]|\d+\.)\s+/gm, '') // list markers
    .replace(/^>\s+/gm, '') // blockquotes
    .replace(/^---+$/gm, '') // hr
    .replace(/\n{2,}/g, ' ') // collapse paragraph breaks
    .replace(/\n/g, ' ') // collapse remaining newlines
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
    .slice(0, maxLength)
}

const newsletterAccentColor: Record<string, string> = {
  contraption: '#2B4A3E',
  workshop: '#6B4D3A',
  postcard: '#2C3E6B',
}

export function renderRelatedPostsHtml(posts: Post[], siteUrl: string): string {
  if (posts.length === 0) return ''

  const postRows = posts
    .map((post) => {
      const url = `${siteUrl}/${post.slug}`
      const accentColor = newsletterAccentColor[post.newsletter] ?? '#7e7a73'
      const thumbnail = post.frontmatter.coverImage
        ? `<td width="100" style="padding-left: 16px; vertical-align: top;">
            <a href="${url}">
              <img src="${siteUrl}${toEmailThumbPath(post.frontmatter.coverImage)}" alt="${post.frontmatter.coverImageAlt ?? post.frontmatter.title}" width="100" height="56" style="display: block; width: 100px; height: 56px;" />
            </a>
          </td>`
        : `<td width="100" style="padding-left: 16px; vertical-align: top;">
            <table cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="100" height="56" bgcolor="${accentColor}" style="width: 100px; height: 56px; background-color: ${accentColor};">
                <a href="${url}" style="display: block; width: 100px; height: 56px; text-decoration: none;">&nbsp;</a>
              </td>
            </tr></table>
          </td>`

      return `<tr>
        <td style="padding: 16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align: top;">
              <a href="${url}" style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 600; color: #111110; text-decoration: none; line-height: 1.4;">${post.frontmatter.title}</a>
              ${post.excerpt ? `<p style="font-family: 'Tiempos Text', Georgia, 'Times New Roman', serif; font-size: 15px; color: #625e58; line-height: 1.5; margin: 6px 0 0;">${post.excerpt}</p>` : ''}
            </td>
            ${thumbnail}
          </tr></table>
        </td>
      </tr>`
    })
    .join('')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 40px; border-top: 1px solid #e0ddd8;">
      <tr><td style="font-size: 1px; line-height: 24px; height: 24px;">&nbsp;</td></tr>
      <tr>
        <td style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #7e7a73; padding-bottom: 12px;">
          Keep reading
        </td>
      </tr>
      ${postRows}
    </table>`
}
