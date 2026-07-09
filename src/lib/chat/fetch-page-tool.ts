import { tool } from 'ai'
import { z } from 'zod/v4'
import { getPageText } from '@/lib/chat/page-content'
import { publicAppPages } from '@/lib/public-pages'

const registeredPaths = publicAppPages.map((page) => page.path).join(', ')

export const fetchPage = tool({
  description: `Fetch the readable text of a site page by its path. Registered app pages are ${registeredPaths}; content pages such as /contact and /colophon also resolve. Use this for questions about the current page and for pages that are not blog posts. For the full text of a blog post prefer fetchPost.`,
  inputSchema: z.object({
    path: z.string().describe('The site path, e.g. "/" or "/contact"'),
  }),
  execute: async ({ path }) => getPageText(path),
})
