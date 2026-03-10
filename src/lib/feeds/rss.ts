import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'

export function generateRss(
  posts: Post[],
  title?: string,
  feedUrl?: string
): string {
  const siteTitle = title ?? siteConfig.title
  const url = feedUrl ?? `${siteConfig.url}/feed/rss.xml`

  const items = posts
    .map(
      (post) => `    <item>
      <title><![CDATA[${post.frontmatter.title}]]></title>
      <link>${siteConfig.url}/${post.slug}</link>
      <guid isPermaLink="true">${siteConfig.url}/${post.slug}</guid>
      <pubDate>${new Date(post.frontmatter.publishedAt).toUTCString()}</pubDate>
      <description><![CDATA[${post.excerpt}]]></description>
    </item>`
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${siteTitle}</title>
    <link>${siteConfig.url}</link>
    <description>${siteConfig.description}</description>
    <language>en-US</language>
    <atom:link href="${url}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`
}
