import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'
import {
  type FeedOptions,
  feedSummary,
  renderPostContentHtml,
} from '@/lib/feeds/render'

export async function generateJsonFeed(
  posts: Post[],
  options: FeedOptions = {}
) {
  const included = options.limit ? posts.slice(0, options.limit) : posts
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: options.title ?? siteConfig.title,
    home_page_url: siteConfig.url,
    feed_url: options.feedUrl ?? `${siteConfig.url}/feed/feed.json`,
    description: options.description ?? siteConfig.description,
    authors: [{ name: siteConfig.author, url: siteConfig.url }],
    items: await Promise.all(
      included.map(async (post) => ({
        id: `${siteConfig.url}/${post.slug}`,
        url: `${siteConfig.url}/${post.slug}`,
        title: post.frontmatter.title,
        // JSON Feed 1.1 requires content_html or content_text on every item.
        content_html: await renderPostContentHtml(post),
        summary: feedSummary(post),
        date_published: new Date(post.frontmatter.publishedAt).toISOString(),
        ...(post.frontmatter.coverImage && {
          image: `${siteConfig.url}${post.frontmatter.coverImage}`,
        }),
        tags: [post.newsletter],
      }))
    ),
  }
}
