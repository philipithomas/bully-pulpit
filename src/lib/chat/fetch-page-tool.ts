import { tool } from 'ai'
import { z } from 'zod/v4'
import { getPageText } from '@/lib/chat/page-content'

export const fetchPage = tool({
  description:
    'Fetch the readable text of a site page by its path, for example "/", "/contraption", or "/colophon". Use this for questions about the current page and for pages that are not blog posts: the homepage, the newsletter indexes, and informational pages. For the full text of a blog post prefer fetchPost.',
  inputSchema: z.object({
    path: z.string().describe('The site path, e.g. "/" or "/colophon"'),
  }),
  execute: async ({ path }) => getPageText(path),
})
