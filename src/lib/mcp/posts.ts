import { z } from 'zod/v4'
import { siteConfig } from '@/lib/config'
import {
  getAllPosts,
  getPostBySlug,
  getPostsByNewsletter,
} from '@/lib/content/loader'
import type { Post } from '@/lib/content/types'
import { newsletterSchema } from '@/lib/content/types'
import { extractHeadings } from '@/lib/search/corpus'
import { getLexicalIndex } from '@/lib/search/lexical'

export const MCP_PROTOCOL_VERSION = '2025-06-18'

const SERVER_NAME = 'philipithomas.com'
const SERVER_VERSION = '1.0.0'
const LIST_POSTS_TOOL = 'list_posts'
const SEARCH_POSTS_TOOL = 'search_posts'
const READ_POST_TOOL = 'read_post'

const DEFAULT_LIST_LIMIT = 10
const MAX_LIST_LIMIT = 50
const DEFAULT_SEARCH_LIMIT = 10
const MAX_SEARCH_LIMIT = 20

const cursorSchema = z.object({
  v: z.literal(1),
  offset: z.number().int().min(0),
  scope: z.string(),
})

const listPostsInputSchema = z.object({
  newsletter: newsletterSchema.optional(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  cursor: z.string().optional(),
})

const searchPostsInputSchema = z.object({
  query: z.string().trim().min(2),
  limit: z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional(),
  cursor: z.string().optional(),
})

const readPostInputSchema = z.object({
  slug: z.string().trim().min(1),
})

interface JsonRpcRequest {
  jsonrpc?: unknown
  id?: unknown
  method?: unknown
  params?: unknown
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  structuredContent: unknown
}

export class McpInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpInputError'
  }
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString()
}

function postSummary(post: Post) {
  return {
    slug: post.slug,
    url: toAbsoluteUrl(`/${post.slug}`),
    newsletter: post.newsletter,
    title: post.frontmatter.title,
    subtitle: post.frontmatter.subtitle ?? null,
    description: post.frontmatter.description ?? null,
    publishedAt: post.frontmatter.publishedAt,
    coverImage: post.frontmatter.coverImage
      ? toAbsoluteUrl(post.frontmatter.coverImage)
      : null,
    coverImageAlt: post.frontmatter.coverImageAlt ?? null,
    excerpt: post.excerpt,
  }
}

function encodeCursor(offset: number, scope: string): string {
  return Buffer.from(JSON.stringify({ v: 1, offset, scope }))
    .toString('base64url')
    .replace(/=+$/, '')
}

function decodeCursor(cursor: string | undefined, scope: string): number {
  if (!cursor) return 0

  try {
    const decoded = cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    )
    if (decoded.scope !== scope) {
      throw new McpInputError('Cursor does not match these tool arguments')
    }
    return decoded.offset
  } catch (error) {
    if (error instanceof McpInputError) throw error
    throw new McpInputError('Cursor is invalid')
  }
}

function paged<T>(
  items: T[],
  limit: number,
  cursor: string | undefined,
  scope: string
) {
  const offset = decodeCursor(cursor, scope)
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return {
    page,
    pagination: {
      limit,
      total: items.length,
      nextCursor:
        nextOffset < items.length ? encodeCursor(nextOffset, scope) : null,
    },
  }
}

function asToolResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function listPosts(args: unknown): ToolResult {
  const input = listPostsInputSchema.parse(args ?? {})
  const limit = input.limit ?? DEFAULT_LIST_LIMIT
  const newsletter = input.newsletter

  const posts = newsletter ? getPostsByNewsletter(newsletter) : getAllPosts()
  const scope = `list:${newsletter ?? 'all'}`
  const { page, pagination } = paged(posts, limit, input.cursor, scope)

  return asToolResult({
    posts: page.map(postSummary),
    pagination,
  })
}

async function searchPosts(args: unknown): Promise<ToolResult> {
  const input = searchPostsInputSchema.parse(args ?? {})
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT
  const query = input.query.trim()
  const scope = `search:${query.toLowerCase()}`

  const [index, posts] = await Promise.all([
    getLexicalIndex(),
    Promise.resolve(getAllPosts()),
  ])
  const postBySlug = new Map(posts.map((post) => [post.slug, post]))
  const hits = index.search(query, posts.length)
  const { page, pagination } = paged(hits, limit, input.cursor, scope)

  return asToolResult({
    query,
    results: page.map((hit) => {
      const post = postBySlug.get(hit.slug)
      return {
        ...hit,
        url: toAbsoluteUrl(hit.url),
        coverImage: hit.coverImage ? toAbsoluteUrl(hit.coverImage) : null,
        publishedAt: post?.frontmatter.publishedAt ?? null,
        description: post?.frontmatter.description ?? null,
        excerpts: index.extractExcerpts(hit.slug, hit.terms, 3),
      }
    }),
    pagination,
  })
}

function readPost(args: unknown): ToolResult {
  const input = readPostInputSchema.parse(args ?? {})
  const post = getPostBySlug(input.slug)
  if (!post) {
    throw new McpInputError(`No post found for slug "${input.slug}"`)
  }

  const outline = extractHeadings(post.content).map((heading) => ({
    heading: heading.text,
    anchor: heading.anchor,
    url: toAbsoluteUrl(`/${post.slug}#${heading.anchor}`),
  }))

  return asToolResult({
    ...postSummary(post),
    outline,
    content: post.content,
  })
}

const newsletterEnum = newsletterSchema.options

export const mcpTools = [
  {
    name: LIST_POSTS_TOOL,
    title: 'List posts',
    description:
      'List published posts, newest first. Supports optional newsletter filtering and opaque cursor pagination.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        newsletter: {
          type: 'string',
          enum: newsletterEnum,
          description:
            'Optional newsletter slug. Omit this to list all published posts.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_LIST_LIMIT,
          default: DEFAULT_LIST_LIMIT,
        },
        cursor: {
          type: 'string',
          description:
            'Opaque cursor from the previous response. Omit for the first page.',
        },
      },
    },
  },
  {
    name: SEARCH_POSTS_TOOL,
    title: 'Search posts',
    description:
      'Search published posts with the local BM25 index. Returns titles, URLs, metadata, excerpts, and opaque cursor pagination.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 2,
          description: 'Search query.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_SEARCH_LIMIT,
          default: DEFAULT_SEARCH_LIMIT,
        },
        cursor: {
          type: 'string',
          description:
            'Opaque cursor from the previous response. Reuse it with the same query.',
        },
      },
    },
  },
  {
    name: READ_POST_TOOL,
    title: 'Read post',
    description:
      'Read one published post by slug. Returns metadata, heading anchors, and the full MDX body.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['slug'],
      properties: {
        slug: {
          type: 'string',
          minLength: 1,
          description: 'Post slug, for example fresh-coat-of-paint.',
        },
      },
    },
  },
] as const

async function callTool(name: string, args: unknown): Promise<ToolResult> {
  if (name === LIST_POSTS_TOOL) return listPosts(args)
  if (name === SEARCH_POSTS_TOOL) return searchPosts(args)
  if (name === READ_POST_TOOL) return readPost(args)
  throw new McpInputError(`Unknown tool "${name}"`)
}

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    (body as JsonRpcRequest).jsonrpc === '2.0' &&
    typeof (body as JsonRpcRequest).method === 'string'
  )
}

function jsonRpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

function toolList(cursor: string | undefined) {
  const offset = decodeCursor(cursor, 'tools')
  const limit = mcpTools.length
  const tools = mcpTools.slice(offset, offset + limit)
  const nextOffset = offset + tools.length
  return {
    tools,
    ...(nextOffset < mcpTools.length
      ? { nextCursor: encodeCursor(nextOffset, 'tools') }
      : {}),
  }
}

export async function handleMcpMessage(body: unknown) {
  if (!isJsonRpcRequest(body)) {
    return {
      status: 400,
      body: jsonRpcError(null, -32600, 'Invalid JSON-RPC request'),
    }
  }

  const { id, method, params } = body
  const isNotification = !Object.hasOwn(body, 'id')

  if (isNotification) {
    if (method === 'notifications/initialized') {
      return { status: 202, body: null }
    }
    return { status: 202, body: null }
  }

  try {
    if (method === 'initialize') {
      return {
        status: 200,
        body: jsonRpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
          instructions:
            'Use these tools to search and read published posts from philipithomas.com.',
        }),
      }
    }

    if (method === 'ping') {
      return { status: 200, body: jsonRpcResult(id, {}) }
    }

    if (method === 'tools/list') {
      const parsed = z
        .object({ cursor: z.string().optional() })
        .optional()
        .parse(params)
      return {
        status: 200,
        body: jsonRpcResult(id, toolList(parsed?.cursor)),
      }
    }

    if (method === 'tools/call') {
      const parsed = z
        .object({
          name: z.string(),
          arguments: z.unknown().optional(),
        })
        .parse(params)
      return {
        status: 200,
        body: jsonRpcResult(
          id,
          await callTool(parsed.name, parsed.arguments ?? {})
        ),
      }
    }

    return {
      status: 200,
      body: jsonRpcError(id, -32601, `Method not found: ${method}`),
    }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof McpInputError) {
      return {
        status: 200,
        body: jsonRpcError(
          id,
          -32602,
          error instanceof McpInputError
            ? error.message
            : z.prettifyError(error)
        ),
      }
    }
    console.error('MCP request failed:', error)
    return {
      status: 500,
      body: jsonRpcError(id, -32603, 'Internal error'),
    }
  }
}
