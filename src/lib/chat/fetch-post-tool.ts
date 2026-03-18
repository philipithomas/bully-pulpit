import { tool } from 'ai'
import { z } from 'zod/v4'
import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'

export const fetchPost = tool({
  description:
    'Fetch the full text of a blog post or page by its slug. Use this when search excerpts are not enough and you need the complete content to answer in depth.',
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

    return JSON.stringify({
      title: item.frontmatter.title,
      description: item.frontmatter.description ?? null,
      publishedAt: item.frontmatter.publishedAt ?? null,
      newsletter: 'newsletter' in item ? item.newsletter : null,
      content: item.content,
    })
  },
})
