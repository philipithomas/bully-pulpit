import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitStatus: vi.fn(async () => 'unavailable'),
}))

import { DELETE, GET, POST } from '@/app/mcp/route'
import { checkRateLimitStatus } from '@/lib/rate-limit'

const MCP_URL = 'https://www.philipithomas.com/mcp'
const PROTOCOL_VERSION = '2025-11-25'

const mockedCheckRateLimitStatus = vi.mocked(checkRateLimitStatus)

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: Record<string, unknown>
  error?: {
    code: number
    message: string
  }
}

function mcpRequest(
  body: unknown,
  options: {
    headers?: HeadersInit
    rawBody?: string
  } = {}
): Request {
  return new Request(MCP_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'Mcp-Protocol-Version': PROTOCOL_VERSION,
      ...options.headers,
    },
    body: options.rawBody ?? JSON.stringify(body),
  })
}

async function postJson(
  body: unknown,
  options?: Parameters<typeof mcpRequest>[1]
): Promise<{ response: Response; payload: JsonRpcResponse }> {
  const response = await POST(mcpRequest(body, options))
  return {
    response,
    payload: (await response.json()) as JsonRpcResponse,
  }
}

function initializeRequest(id: number) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'bully-pulpit-test', version: '1.0.0' },
    },
  }
}

function toolsListRequest(id: number) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/list',
    params: {},
  }
}

function toolCallRequest(
  id: number,
  name: 'search' | 'fetch' | 'list_posts',
  args?: Record<string, unknown>
) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: args === undefined ? { name } : { name, arguments: args },
  }
}

function resultObject(payload: JsonRpcResponse): Record<string, unknown> {
  expect(payload.error).toBeUndefined()
  expect(payload.result).toBeDefined()
  return payload.result ?? {}
}

function expectStructuredTextResult(result: Record<string, unknown>) {
  const structuredContent = result.structuredContent as Record<string, unknown>
  const content = result.content as Array<{ type: string; text?: string }>

  expect(structuredContent).toBeDefined()
  expect(content).toEqual([
    { type: 'text', text: JSON.stringify(structuredContent) },
  ])
  return structuredContent
}

describe('POST /mcp', () => {
  beforeEach(() => {
    mockedCheckRateLimitStatus.mockReset()
    mockedCheckRateLimitStatus.mockResolvedValue('unavailable')
  })

  it('initializes with stable server metadata and no session', async () => {
    const { response, payload } = await postJson(initializeRequest(1))
    const result = resultObject(payload)

    expect(response.status).toBe(200)
    expect(response.headers.get('mcp-session-id')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(result).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: true } },
      serverInfo: {
        name: 'philipithomas-content',
        title: "Philip Ilic Thomas's writing",
        version: '1.0.0',
        websiteUrl: 'https://www.philipithomas.com/mcp/setup',
      },
    })
    expect(result.instructions).toContain('Use search')
  })

  it('lists strict read-only tools with no-auth metadata', async () => {
    const { response, payload } = await postJson(toolsListRequest(2))
    const result = resultObject(payload)
    const tools = result.tools as Array<{
      name: string
      inputSchema: Record<string, unknown>
      outputSchema: Record<string, unknown>
      annotations: Record<string, unknown>
      securitySchemes: Array<{ type: string }>
      _meta: Record<string, unknown>
    }>

    expect(response.status).toBe(200)
    expect(tools.map((tool) => tool.name)).toEqual([
      'search',
      'fetch',
      'list_posts',
    ])
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      })
      expect(tool.outputSchema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      })
      expect(tool.annotations).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })
      expect(tool.securitySchemes).toEqual([{ type: 'noauth' }])
      expect(tool._meta).toEqual({
        securitySchemes: [{ type: 'noauth' }],
      })
    }
  })

  it('searches lexically and returns matching structured and text output', async () => {
    const { response, payload } = await postJson(
      toolCallRequest(3, 'search', { query: 'MCP' }),
      {
        headers: {
          'x-vercel-forwarded-for': '203.0.113.8, 10.0.0.1',
        },
      }
    )
    const structured = expectStructuredTextResult(resultObject(payload))
    const results = structured.results as Array<{
      id: string
      title: string
      url: string
    }>

    expect(response.status).toBe(200)
    expect(results).toContainEqual(
      expect.objectContaining({
        id: 'mcp-and-the-future-of-ai',
        title: 'MCP and the future of AI',
        url: 'https://www.philipithomas.com/mcp-and-the-future-of-ai',
      })
    )
    expect(mockedCheckRateLimitStatus).toHaveBeenCalledWith(
      'search',
      'ip:203.0.113.8',
      expect.any(Request)
    )
  })

  it('fetches complete public content with structured and text output', async () => {
    const { payload } = await postJson(
      toolCallRequest(4, 'fetch', { id: 'mcp-and-the-future-of-ai' })
    )
    const structured = expectStructuredTextResult(resultObject(payload))

    expect(structured).toMatchObject({
      id: 'mcp-and-the-future-of-ai',
      title: 'MCP and the future of AI',
      url: 'https://www.philipithomas.com/mcp-and-the-future-of-ai',
      metadata: {
        content_type: 'post',
        newsletter: 'contraption',
      },
    })
    expect(structured.text).toEqual(expect.stringContaining('MCP'))
    expect(mockedCheckRateLimitStatus).not.toHaveBeenCalled()
  })

  it('lists newsletter posts with structured and text output', async () => {
    const { payload } = await postJson(
      toolCallRequest(5, 'list_posts', {
        limit: 2,
        offset: 0,
        newsletter: 'workshop',
      })
    )
    const structured = expectStructuredTextResult(resultObject(payload))
    const posts = structured.posts as Array<{
      newsletter: string
      url: string
    }>

    expect(posts).toHaveLength(2)
    expect(posts.every((post) => post.newsletter === 'workshop')).toBe(true)
    expect(posts.every((post) => post.url.startsWith('https://'))).toBe(true)
    expect(structured.pagination).toMatchObject({ offset: 0, limit: 2 })
    expect(mockedCheckRateLimitStatus).not.toHaveBeenCalled()
  })

  it('lists the latest posts when arguments are omitted', async () => {
    const { payload } = await postJson(toolCallRequest(6, 'list_posts'))
    const structured = expectStructuredTextResult(resultObject(payload))
    const posts = structured.posts as Array<{ id: string }>

    expect(posts).toHaveLength(5)
    expect(structured.pagination).toMatchObject({ offset: 0, limit: 5 })
    expect(mockedCheckRateLimitStatus).not.toHaveBeenCalled()
  })

  it('keeps independent stateless requests isolated when IDs repeat', async () => {
    const [first, second] = await Promise.all([
      postJson(toolsListRequest(9)),
      postJson(toolsListRequest(9)),
    ])

    expect(first.response.status).toBe(200)
    expect(second.response.status).toBe(200)
    expect(first.response.headers.get('mcp-session-id')).toBeNull()
    expect(second.response.headers.get('mcp-session-id')).toBeNull()
    expect(first.payload).toEqual(second.payload)
    expect(first.payload.id).toBe(9)
  })

  it('rejects an unlisted Origin before parsing the request', async () => {
    const { response, payload } = await postJson(toolsListRequest(10), {
      headers: { Origin: 'https://attacker.example' },
    })

    expect(response.status).toBe(403)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(payload.error).toEqual({
      code: -32000,
      message: 'Origin is not allowed',
    })
  })

  it('rejects JSON-RPC batches before making a search quota decision', async () => {
    const { response, payload } = await postJson([
      toolCallRequest(14, 'search', { query: 'coffee' }),
      toolCallRequest(15, 'search', { query: 'software' }),
    ])

    expect(response.status).toBe(400)
    expect(payload.error).toEqual({
      code: -32600,
      message: 'JSON-RPC batches are not supported',
    })
    expect(mockedCheckRateLimitStatus).not.toHaveBeenCalled()
  })

  it('returns the SDK parse error for malformed JSON', async () => {
    const { response, payload } = await postJson({}, { rawBody: '{' })

    expect(response.status).toBe(400)
    expect(payload.error).toEqual({
      code: -32700,
      message: 'Parse error: Invalid JSON',
    })
  })

  it('returns the SDK error when Accept omits event streams', async () => {
    const { response, payload } = await postJson(toolsListRequest(11), {
      headers: { Accept: 'application/json' },
    })

    expect(response.status).toBe(406)
    expect(payload.error).toEqual({
      code: -32000,
      message:
        'Not Acceptable: Client must accept both application/json and text/event-stream',
    })
  })

  it('returns the SDK error for a non-JSON content type', async () => {
    const { response, payload } = await postJson(toolsListRequest(12), {
      headers: { 'Content-Type': 'text/plain' },
    })

    expect(response.status).toBe(415)
    expect(payload.error).toEqual({
      code: -32000,
      message: 'Unsupported Media Type: Content-Type must be application/json',
    })
  })

  it('returns the SDK error for an unsupported protocol version', async () => {
    const { response, payload } = await postJson(toolsListRequest(13), {
      headers: { 'Mcp-Protocol-Version': '2099-01-01' },
    })

    expect(response.status).toBe(400)
    expect(payload.error?.code).toBe(-32000)
    expect(payload.error?.message).toContain(
      'Bad Request: Unsupported protocol version: 2099-01-01'
    )
  })
})

describe('non-POST /mcp methods', () => {
  it.each([
    ['GET', GET],
    ['DELETE', DELETE],
  ] as const)('returns 405 for %s', async (_method, handler) => {
    const response = handler(new Request(MCP_URL))
    const payload = (await response.json()) as JsonRpcResponse

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST, OPTIONS')
    expect(payload.error).toEqual({
      code: -32000,
      message: 'Method not allowed',
    })
  })
})
