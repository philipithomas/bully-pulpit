import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'
import {
  type FeedOptions,
  feedSummary,
  renderPostContentHtml,
} from '@/lib/feeds/render'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// A literal `]]>` inside a CDATA section would terminate it early, so it is
// split across two sections.
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

export async function generateRss(
  posts: Post[],
  options: FeedOptions = {}
): Promise<string> {
  const siteTitle = options.title ?? siteConfig.title
  const description = options.description ?? siteConfig.description
  const url = options.feedUrl ?? `${siteConfig.url}/feed/rss.xml`
  const included = options.limit ? posts.slice(0, options.limit) : posts

  const items = await Promise.all(
    included.map(
      async (post) => `    <item>
      <title>${cdata(post.frontmatter.title)}</title>
      <link>${siteConfig.url}/${post.slug}</link>
      <guid isPermaLink="true">${siteConfig.url}/${post.slug}</guid>
      <pubDate>${new Date(post.frontmatter.publishedAt).toUTCString()}</pubDate>
      <description>${cdata(feedSummary(post))}</description>
      <content:encoded>${cdata(await renderPostContentHtml(post))}</content:encoded>
    </item>`
    )
  )

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${siteConfig.url}</link>
    <description>${escapeXml(description)}</description>
    <language>en-US</language>
    <atom:link href="${url}" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>`
}
