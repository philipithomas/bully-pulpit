import { siteConfig } from '@/lib/config'
import { getAllPosts } from '@/lib/content/loader'

export async function GET() {
  const posts = getAllPosts()

  const postList = posts
    .map(
      (p) =>
        `- [${p.frontmatter.title}](${siteConfig.url}/${p.slug}.md) (${p.newsletter}, ${p.frontmatter.publishedAt})`
    )
    .join('\n')

  const body = `# ${siteConfig.title}

> ${siteConfig.description}

## Author

${siteConfig.author}

## Newsletters

- Contraption: Essays and projects.
- Workshop: Journal about work in progress.
- Postcard: What I'm up to.

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
