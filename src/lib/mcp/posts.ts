import { z } from 'zod/v4'
import { newsletterSchema } from '@/lib/content/types'
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_SEARCH_LIMIT,
  decodeCursor,
  encodeCursor,
  listPublicPosts,
  MAX_LIST_LIMIT,
  MAX_SEARCH_LIMIT,
  PublicApiInputError,
  PublicApiNotFoundError,
  readPublicPost,
  searchPublicPosts,
} from '@/lib/public-api/posts'

export const MCP_PROTOCOL_VERSION = '2025-06-18'

const SERVER_NAME = 'philipithomas.com'
const SERVER_VERSION = '1.0.0'
const LIST_POSTS_TOOL = 'list_posts'
const SEARCH_POSTS_TOOL = 'search_posts'
const READ_POST_TOOL = 'read_post'

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

function asToolResult(data: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
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
      'Search published posts with local hybrid BM25/vector search. Returns titles, URLs, metadata, excerpts, and opaque cursor pagination.',
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
  if (name === LIST_POSTS_TOOL) return asToolResult(listPublicPosts(args))
  if (name === SEARCH_POSTS_TOOL) {
    return asToolResult(await searchPublicPosts(args))
  }
  if (name === READ_POST_TOOL) return asToolResult(readPublicPost(args))
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
    if (
      error instanceof z.ZodError ||
      error instanceof McpInputError ||
      error instanceof PublicApiInputError ||
      error instanceof PublicApiNotFoundError
    ) {
      return {
        status: 200,
        body: jsonRpcError(
          id,
          -32602,
          error instanceof McpInputError ||
            error instanceof PublicApiInputError ||
            error instanceof PublicApiNotFoundError
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
