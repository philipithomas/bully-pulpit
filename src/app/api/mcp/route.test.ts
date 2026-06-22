import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { OPTIONS, POST } from '@/app/api/mcp/route'

function request(body: unknown, headers: HeadersInit = {}) {
  return new NextRequest('http://localhost:3000/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('MCP route', () => {
  it('responds to JSON-RPC POST requests', async () => {
    const response = await POST(
      request({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    const body = await response.json()
    expect(
      body.result.tools.map((tool: { name: string }) => tool.name)
    ).toEqual(['list_posts', 'search_posts', 'read_post'])
  })

  it('rejects disallowed browser origins', async () => {
    const response = await POST(
      request(
        { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
        { Origin: 'https://example.com' }
      )
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.message).toBe('Origin is not allowed')
  })

  it('allows local preflight requests', async () => {
    const response = await OPTIONS(
      new NextRequest('http://localhost:3000/api/mcp', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'http://localhost:3000'
    )
  })
})
