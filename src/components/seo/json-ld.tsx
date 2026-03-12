import { siteConfig } from '@/lib/config'
import type { Page, Post } from '@/lib/content/types'

interface JsonLdProps {
  type: 'website' | 'article'
  post?: Post
  page?: Page
}

export function JsonLd({ type, post, page }: JsonLdProps) {
  const item = post ?? page

  if (type === 'website') {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteConfig.title,
      url: siteConfig.url,
      description: siteConfig.description,
      author: {
        '@type': 'Person',
        name: siteConfig.author,
      },
    }
    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    )
  }

  if (type === 'article' && item) {
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: item.frontmatter.title,
      description: item.frontmatter.description ?? siteConfig.description,
      ...(item.frontmatter.publishedAt && {
        datePublished: item.frontmatter.publishedAt,
      }),
      author: {
        '@type': 'Person',
        name: siteConfig.author,
        url: siteConfig.url,
      },
      publisher: {
        '@type': 'Person',
        name: siteConfig.author,
      },
      url: `${siteConfig.url}/${post?.slug ?? page?.slug}`,
      ...(item.frontmatter.coverImage && {
        image: `${siteConfig.url}${item.frontmatter.coverImage}`,
      }),
    }
    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    )
  }

  return null
}
