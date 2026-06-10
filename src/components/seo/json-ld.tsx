import { siteConfig } from '@/lib/config'
import type { Page, Post } from '@/lib/content/types'

interface JsonLdProps {
  type: 'website' | 'article'
  post?: Post
  page?: Page
}

/**
 * Plain JSON.stringify is unsafe inside a script element: a string field
 * containing "</script" would close the tag early and turn the remainder of
 * the page into attacker-controlled markup. Escaping "<" as the JSON escape
 * sequence backslash-u003c keeps the parsed value byte-identical while making
 * early termination impossible. Content here is owner-authored, so this is a
 * latent guard.
 */
export function serializeJsonLd(schema: object): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c')
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
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
        // Frontmatter has no updated-date field, so the publish date is the
        // best available modification signal.
        dateModified: item.frontmatter.publishedAt,
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
      // Fall back to the site-wide image when the item has no cover,
      // matching the openGraph fallback.
      image: `${siteConfig.url}${item.frontmatter.coverImage ?? siteConfig.image}`,
    }
    return (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
      />
    )
  }

  return null
}
