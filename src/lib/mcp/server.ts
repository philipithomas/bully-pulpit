import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  fetchInputSchema,
  fetchOutputSchema,
  fetchPublicContent,
  listPostsInputSchema,
  listPostsOutputSchema,
  listPublicPosts,
  searchInputSchema,
  searchOutputSchema,
  searchPublicContent,
} from '@/lib/mcp/content-tools'
import { siteIdentity } from '@/lib/site-identity'

export type McpSearchAccess = 'hybrid' | 'lexical' | 'limited'

const noAuthMeta = {
  securitySchemes: [{ type: 'noauth' }],
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

function toolResult<T extends object>(value: T) {
  return {
    structuredContent: value,
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  }
}

export function createSiteMcpServer(
  searchAccess: McpSearchAccess = 'hybrid'
): McpServer {
  const server = new McpServer(
    {
      name: 'philipithomas-content',
      title: "Philip Ilic Thomas's writing",
      version: '1.0.0',
      description:
        "Search, list, and read the writing and pages on Philip Ilic Thomas's website.",
      websiteUrl: `${siteIdentity.productionUrl}/mcp/setup`,
      icons: [
        {
          src: `${siteIdentity.productionUrl}/icon-512.png`,
          mimeType: 'image/png',
          sizes: ['512x512'],
        },
      ],
    },
    {
      instructions:
        "Use search to find Philip Ilic Thomas's writing and pages by subject, person, place, project, phrase, title, or relevance. Read the returned excerpts to select useful sources, then fetch their IDs for complete text and citation URLs. For broad questions, compare sources that add distinct evidence instead of relying on one result. Use list_posts only when the user explicitly asks to list or browse the latest, recent, chronological, or newsletter-filtered archive. All tools are public, read-only, and require no authentication.",
    }
  )

  server.registerTool(
    'search',
    {
      title: "Search Philip's writing",
      description:
        "Find Philip Ilic Thomas's writing or site pages by subject, person, place, project, phrase, title, topic, or relevance. Use a short focused query such as 'noma' or 'snail-mail print edition'; omit Philip's name and generic question wording because this index only covers his site. Returns up to ten matches with dates, content type, and relevant excerpts. Inspect excerpts across the full result set to distinguish useful sources from incidental mentions, then call fetch for complete text before interpreting or comparing posts.",
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: noAuthMeta,
    },
    async ({ query }) => {
      if (searchAccess === 'limited') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Too many searches. Please try again later.',
            },
          ],
        }
      }

      return toolResult(
        await searchPublicContent(query, {
          useVector: searchAccess === 'hybrid',
        })
      )
    }
  )

  server.registerTool(
    'fetch',
    {
      title: 'Read a post or page',
      description:
        'Read the full text of a post or page, including image descriptions from alt text, authored location, and photo metadata, capped at 50,000 characters. For synthesis or comparisons, fetch the distinct relevant sources identified by search. Pass the stable ID returned by search or list_posts; this tool does not fetch arbitrary URLs.',
      inputSchema: fetchInputSchema,
      outputSchema: fetchOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: noAuthMeta,
    },
    async ({ id }) => toolResult(fetchPublicContent(id))
  )

  server.registerTool(
    'list_posts',
    {
      title: 'List published posts',
      description:
        "Use this only when a user explicitly asks to list or browse Philip Ilic Thomas's latest, recent, chronological, or newsletter-filtered archive. Returns published posts newest first; use search whenever topical relevance matters.",
      inputSchema: listPostsInputSchema,
      outputSchema: listPostsOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: noAuthMeta,
    },
    async (input) => toolResult(listPublicPosts(input))
  )

  return server
}
