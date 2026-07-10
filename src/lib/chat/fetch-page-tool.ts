import { tool } from 'ai'
import { z } from 'zod/v4'
import { getPageText } from '@/lib/chat/page-content'
import { getPageBySlug, getPostBySlug } from '@/lib/content/loader'
import { NEWSLETTERS, type Newsletter } from '@/lib/content/types'
import { findPublicAppPage, publicAppPages } from '@/lib/public-pages'

interface FetchPageResult {
  type: 'post' | 'page'
  title: string
  url: string
  publishedAt: string | null
  newsletter: string
  content: string
}

function fetchPageResult(path: string): FetchPageResult | { error: string } {
  const content = getPageText(path)
  if (content.startsWith('No page exists at that path.')) {
    return { error: content }
  }

  const normalized = path === '/' ? '/' : path.replace(/\/+$/, '')
  const appPage = findPublicAppPage(normalized)
  if (appPage) {
    const slug = normalized.replace(/^\//, '')
    const newsletter = (NEWSLETTERS as readonly string[]).includes(slug)
      ? (slug as Newsletter)
      : 'page'
    return {
      type: 'page',
      title: appPage.title,
      url: appPage.path,
      publishedAt: null,
      newsletter,
      content,
    }
  }

  const slug = normalized.replace(/^\//, '')
  const post = getPostBySlug(slug)
  const page = post ? null : getPageBySlug(slug)
  const item = post ?? page
  if (!item) return { error: content }

  return {
    type: post ? 'post' : 'page',
    title: item.frontmatter.title,
    url: normalized,
    publishedAt: item.frontmatter.publishedAt ?? null,
    newsletter: post?.newsletter ?? 'page',
    content,
  }
}

const registeredPaths = publicAppPages.map((page) => page.path).join(', ')

export const fetchPage = tool({
  description: `Fetch a site page by its path. Registered app pages are ${registeredPaths}; content pages such as /contact and /colophon also resolve. Returns structured title, URL, date/newsletter metadata when available, and readable content. Use this for questions about the current page and for pages that are not blog posts. For the full text of a blog post prefer fetchPost.`,
  inputSchema: z.object({
    path: z.string().describe('The site path, e.g. "/" or "/contact"'),
  }),
  execute: async ({ path }) => JSON.stringify(fetchPageResult(path)),
})
