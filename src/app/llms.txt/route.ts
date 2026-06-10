import { siteConfig } from '@/lib/config'
import { getAllPosts } from '@/lib/content/loader'

export const dynamic = 'force-static'

export async function GET() {
  const posts = getAllPosts()

  const postList = posts
    .map(
      (p) =>
        `- [${p.frontmatter.title}](${siteConfig.url}/${p.slug}.md) (${p.newsletter}, ${p.frontmatter.publishedAt})`
    )
    .join('\n')

  // Taglines come from siteConfig so llms.txt and the signup picker cannot
  // drift.
  const newsletterList = (['contraption', 'workshop', 'postcard'] as const)
    .map((id) => {
      const newsletter = siteConfig.newsletters[id]
      return `- ${newsletter.name}: ${newsletter.tagline}`
    })
    .join('\n')

  const body = `# ${siteConfig.title}

> ${siteConfig.description}

## Author

${siteConfig.author}

## Newsletters

${newsletterList}

## Posts

${postList}

## Links

- Website: ${siteConfig.url}
- RSS: ${siteConfig.url}/feed/rss.xml
- JSON Feed: ${siteConfig.url}/feed/feed.json
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
