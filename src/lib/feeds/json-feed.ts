import { siteConfig } from '@/lib/config'
import type { Post } from '@/lib/content/types'

export function generateJsonFeed(
  posts: Post[],
  title?: string,
  feedUrl?: string
) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: title ?? siteConfig.title,
    home_page_url: siteConfig.url,
    feed_url: feedUrl ?? `${siteConfig.url}/feed/feed.json`,
    description: siteConfig.description,
    authors: [{ name: siteConfig.author, url: siteConfig.url }],
    items: posts.map((post) => ({
      id: `${siteConfig.url}/${post.slug}`,
      url: `${siteConfig.url}/${post.slug}`,
      title: post.frontmatter.title,
      summary: post.excerpt,
      date_published: new Date(post.frontmatter.publishedAt).toISOString(),
      ...(post.frontmatter.coverImage && {
        image: `${siteConfig.url}${post.frontmatter.coverImage}`,
      }),
      tags: [post.newsletter],
    })),
  }
}
