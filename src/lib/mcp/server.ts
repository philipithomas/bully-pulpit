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
        "Use search to find Philip Ilic Thomas's writing, photos, and pages by subject, person, place, project, phrase, title, or relevance. For photos or places he has photographed, use scope images and inspect authored locations and image descriptions as well as excerpts. Fetch the returned IDs for complete text and citation URLs. Photo locations can support where a photo was taken; an incidental cover cannot establish an essay's argument or Philip's opinion. For broad questions, compare sources that add distinct evidence instead of relying on one result. Use list_posts only when the user explicitly asks to list or browse the latest, recent, chronological, or newsletter-filtered archive. All tools are public, read-only, and require no authentication.",
    }
  )

  server.registerTool(
    'search',
    {
      title: "Search Philip's writing",
      description:
        "Find Philip Ilic Thomas's writing, photos, or site pages by subject, person, place, project, phrase, title, topic, or relevance. Use a short focused query such as 'Kyoto', 'noma', or 'snail-mail print edition'; omit Philip's name and generic question wording because this index only covers his site. Use scope images for photos and places he has photographed; the default posts scope includes writing and photo posts. Returns up to ten matches with dates, descriptions, authored photo locations, image metadata, and relevant excerpts. Inspect the complete result set, then call fetch with a result's id for complete text before interpreting or comparing sources. Image IDs are separate from the fetchable result id.",
      inputSchema: searchInputSchema,
      outputSchema: searchOutputSchema,
      annotations: readOnlyAnnotations,
      _meta: noAuthMeta,
    },
    async ({ query, scope }) => {
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
          scope,
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
