import type { NextRequest } from 'next/server'
import { siteConfig } from '@/lib/config'
import { handleMcpMessage } from '@/lib/mcp/posts'

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Accept, Mcp-Method, Mcp-Name, Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
}

function isLocalhost(origin: URL): boolean {
  return (
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1' ||
    origin.hostname === '[::1]'
  )
}

function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true

  try {
    const incoming = new URL(origin)
    const requestOrigin = new URL(request.url).origin
    const configuredOrigin = new URL(siteConfig.url).origin

    return (
      incoming.origin === requestOrigin ||
      incoming.origin === configuredOrigin ||
      isLocalhost(incoming)
    )
  } catch {
    return false
  }
}

function responseHeaders(request: NextRequest): HeadersInit {
  const origin = request.headers.get('origin')
  return {
    ...CORS_HEADERS,
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  }
}

function jsonResponse(
  request: NextRequest,
  body: unknown,
  init: ResponseInit = {}
) {
  return Response.json(body, {
    ...init,
    headers: {
      ...responseHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  })
}

export function OPTIONS(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse(
      request,
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Origin is not allowed' },
      },
      { status: 403 }
    )
  }

  return new Response(null, {
    status: 204,
    headers: responseHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse(
      request,
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Origin is not allowed' },
      },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(
      request,
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      },
      { status: 400 }
    )
  }

  const result = await handleMcpMessage(body)
  if (result.status === 202 || result.body === null) {
    return new Response(null, {
      status: result.status,
      headers: responseHeaders(request),
    })
  }

  return jsonResponse(request, result.body, { status: result.status })
}

export function GET(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return jsonResponse(
      request,
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32000, message: 'Origin is not allowed' },
      },
      { status: 403 }
    )
  }

  return jsonResponse(
    request,
    {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32000,
        message:
          'This MCP endpoint accepts Streamable HTTP POST requests. Open /mcp in a browser for setup instructions.',
      },
    },
    {
      status: 405,
      headers: { Allow: 'POST, OPTIONS' },
    }
  )
}
