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
        "Search, list, and read the public writing and pages on Philip Ilic Thomas's website.",
      websiteUrl: `${siteIdentity.productionUrl}/mcp`,
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
        "Use search to find Philip Ilic Thomas's public writing and pages by subject, then fetch a returned ID for complete text and a citation URL. Use list_posts for latest, recent, chronological, or newsletter-specific requests. All tools are public, read-only, and require no authentication.",
    }
  )

  server.registerTool(
    'search',
    {
      title: 'Search public writing',
      description:
        "Use this when a user wants to find Philip Ilic Thomas's public writing or site pages by topic. Returns up to ten citable matches; call fetch with a returned ID for complete text.",
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
      title: 'Fetch a public post or page',
      description:
        'Use this when a user wants the text of one public post or page, capped at 50,000 characters. Pass the stable ID returned by search or list_posts; this tool does not fetch arbitrary URLs.',
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
        "Use this when a user asks for Philip Ilic Thomas's latest, recent, chronological, or newsletter-specific posts. Returns published posts newest first; use search when topical relevance matters.",
      inputSchema: listPostsInputSchema,
      outputSchema: listPostsOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: noAuthMeta,
    },
    async (input) => toolResult(listPublicPosts(input))
  )

  return server
}
