import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import type { Post } from '@/lib/content/types'

export async function renderMarkdownToHtml(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
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
    html += `<p style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 400; color: #7E7A73; line-height: 1.4; text-align: center; margin: 0 0 4px;">${subtitle}</p>`
  }

  html += `<p style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 400; color: #9E9A93; text-align: center; margin: 0 0 24px;">By Philip I. Thomas</p>`

  if (coverImage) {
    const imgUrl = coverImage.startsWith('http')
      ? coverImage
      : `${siteUrl}${coverImage}`
    const alt = coverImageAlt ?? title
    html += `<img src="${imgUrl}" alt="${alt}" style="width: 100%; max-width: 100%; height: auto; display: block; margin: 0 0 24px;">`
  }

  html += `<div style="font-size: 1px; line-height: 24px; height: 24px;">&nbsp;</div>`

  return html
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
              <img src="${siteUrl}${post.frontmatter.coverImage}" alt="${post.frontmatter.coverImageAlt ?? post.frontmatter.title}" width="100" height="56" style="display: block; width: 100px; height: 56px;" />
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
