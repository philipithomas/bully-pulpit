import { createSiteMcpServer, type McpSearchAccess } from '@/lib/mcp/server'
import { StoreCompatibleMcpTransport } from '@/lib/mcp/transport'
import { checkRateLimitStatus } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const ALLOWED_REMOTE_ORIGINS = new Set([
  'https://chatgpt.com',
  'https://platform.openai.com',
  'https://claude.ai',
  'https://www.philipithomas.com',
])

function isLoopback(origin: URL): boolean {
  return (
    (origin.protocol === 'http:' || origin.protocol === 'https:') &&
    (origin.hostname === 'localhost' ||
      origin.hostname === '127.0.0.1' ||
      origin.hostname === '[::1]')
  )
}

function isAllowedOrigin(request: Request): boolean {
  const rawOrigin = request.headers.get('origin')
  if (!rawOrigin) return true

  try {
    const origin = new URL(rawOrigin)
    return (
      origin.origin === new URL(request.url).origin ||
      ALLOWED_REMOTE_ORIGINS.has(origin.origin) ||
      isLoopback(origin)
    )
  } catch {
    return false
  }
}

function withResponseHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers)
  const origin = request.headers.get('origin')
  if (origin && isAllowedOrigin(request)) {
    headers.set('Access-Control-Allow-Origin', origin)
  }
  headers.set('Cache-Control', 'private, no-store')
  headers.set('Vary', 'Origin')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function jsonRpcError(
  request: Request,
  status: number,
  code: number,
  message: string,
  headers: HeadersInit = {}
): Response {
  return withResponseHeaders(
    request,
    Response.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code, message },
      },
      { status, headers }
    )
  )
}

function containsSearchCall(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSearchCall)
  if (!value || typeof value !== 'object') return false

  const request = value as {
    method?: unknown
    params?: { name?: unknown }
  }
  return request.method === 'tools/call' && request.params?.name === 'search'
}

function callerIp(request: Request): string {
  return (
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

async function searchAccessForRequest(
  request: Request,
  body: unknown
): Promise<McpSearchAccess> {
  if (!containsSearchCall(body)) return 'hybrid'

  const status = await checkRateLimitStatus(
    'search',
    `ip:${callerIp(request)}`,
    request.clone()
  )
  if (status === 'limited') return 'limited'
  return status === 'allowed' ? 'hybrid' : 'lexical'
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return jsonRpcError(request, 403, -32000, 'Origin is not allowed')
  }

  const body = await request
    .clone()
    .json()
    .catch(() => null)
  // The current Streamable HTTP specification permits one JSON-RPC message
  // per POST. Reject legacy batches so callers cannot fan multiple paid search
  // embeddings out behind one rate-limit decision.
  if (Array.isArray(body)) {
    return jsonRpcError(
      request,
      400,
      -32600,
      'JSON-RPC batches are not supported'
    )
  }

  const server = createSiteMcpServer(
    await searchAccessForRequest(request, body)
  )
  const transport = new StoreCompatibleMcpTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    const response = await transport.handleRequest(request)
    return withResponseHeaders(request, response)
  } catch (error) {
    console.error(
      '[mcp] request failed:',
      error instanceof Error ? error.name : 'UnknownError'
    )
    return jsonRpcError(
      request,
      500,
      -32603,
      'The MCP server could not complete this request. Try again; if the problem continues, contact mail@philipithomas.com.'
    )
  } finally {
    await server.close()
  }
}

function methodNotAllowed(request: Request): Response {
  if (!isAllowedOrigin(request)) {
    return jsonRpcError(request, 403, -32000, 'Origin is not allowed')
  }
  return jsonRpcError(request, 405, -32000, 'Method not allowed', {
    Allow: 'POST, OPTIONS',
  })
}

export function GET(request: Request): Response {
  return methodNotAllowed(request)
}

export function HEAD(request: Request): Response {
  return methodNotAllowed(request)
}

export function DELETE(request: Request): Response {
  return methodNotAllowed(request)
}

export function OPTIONS(request: Request): Response {
  if (!isAllowedOrigin(request)) {
    return jsonRpcError(request, 403, -32000, 'Origin is not allowed')
  }

  return withResponseHeaders(
    request,
    new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers':
          'Accept, Content-Type, Last-Event-ID, Mcp-Protocol-Version, Mcp-Session-Id',
        'Access-Control-Expose-Headers': 'Mcp-Protocol-Version, Mcp-Session-Id',
        'Access-Control-Max-Age': '86400',
      },
    })
  )
}
