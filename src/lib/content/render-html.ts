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

export function renderRelatedPostsHtml(posts: Post[], siteUrl: string): string {
  if (posts.length === 0) return ''

  const postRows = posts
    .map((post) => {
      const url = `${siteUrl}/${post.slug}`
      const thumbnail = post.frontmatter.coverImage
        ? `<td style="padding-left: 16px; vertical-align: top; width: 100px;">
            <a href="${url}">
              <img src="${siteUrl}${post.frontmatter.coverImage}" alt="${post.frontmatter.coverImageAlt ?? post.frontmatter.title}" width="100" style="display: block; border-radius: 2px; object-fit: cover;" />
            </a>
          </td>`
        : ''

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
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 40px; border-top: 1px solid #e0ddd8; padding-top: 24px;">
      <tr>
        <td style="font-family: 'Sohne', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #7e7a73; padding-bottom: 12px;">
          Keep reading
        </td>
      </tr>
      ${postRows}
    </table>`
}
