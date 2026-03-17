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
