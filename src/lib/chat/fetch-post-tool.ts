import { tool } from 'ai'
import { z } from 'zod/v4'
import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'
import { extractHeadings, extractImageAssets } from '@/lib/search/corpus'
import { stargazingPageContent } from '@/lib/stargazing/restaurants'

export const fetchPost = tool({
  description:
    'Fetch the full text and source metadata of a blog post or page by its slug. Use this when search excerpts are not enough and you need the complete content to answer in depth. The outline lists each heading with its /slug#anchor URL for citing sections.',
  inputSchema: z.object({
    slug: z
      .string()
      .describe(
        'The post slug from a search result URL, e.g. "fresh-coat-of-paint"'
      ),
  }),
  execute: async ({ slug }) => {
    const post = getPostBySlug(slug)
    const page = post ? null : getPageBySlug(slug)
    const item = post ?? page

    if (!item) {
      return JSON.stringify({ error: `No post found for slug "${slug}"` })
    }

    const content =
      item.slug === 'stargazing'
        ? stargazingPageContent(item.content)
        : item.content

    // Heading outline with anchors, same algorithm as the search corpus, so
    // section citations from a full read match the ones search returns
    const outline = extractHeadings(content).map((h) => ({
      heading: h.text,
      anchor: h.anchor,
      url: `/${item.slug}#${h.anchor}`,
    }))
    const images = post
      ? extractImageAssets(post).map((image) => ({
          id: image.id,
          src: image.src,
          alt: image.alt,
          kind: image.kind,
          url: image.heading
            ? `/${item.slug}#${image.heading.anchor}`
            : `/${item.slug}`,
          description: image.alt,
          ...(image.heading
            ? {
                section: {
                  heading: image.heading.text,
                  url: `/${item.slug}#${image.heading.anchor}`,
                },
              }
            : {}),
        }))
      : []

    return JSON.stringify({
      type: post ? 'post' : 'page',
      title: item.frontmatter.title,
      url: `/${item.slug}`,
      description: item.frontmatter.description ?? null,
      publishedAt: item.frontmatter.publishedAt ?? null,
      newsletter: 'newsletter' in item ? item.newsletter : null,
      outline,
      images,
      content,
    })
  },
})
