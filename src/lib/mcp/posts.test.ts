import { describe, expect, it } from 'vitest'
import {
  handleMcpMessage,
  MCP_PROTOCOL_VERSION,
  type mcpTools,
} from '@/lib/mcp/posts'

interface RpcEnvelope {
  result?: {
    tools?: typeof mcpTools
    content?: Array<{ text: string }>
    structuredContent?: unknown
  }
  error?: { code: number; message: string }
}

async function call(method: string, params?: unknown): Promise<RpcEnvelope> {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1,
    method,
    ...(params === undefined ? {} : { params }),
  })
  return response.body as RpcEnvelope
}

describe('MCP posts server', () => {
  it('initializes with tool capabilities', async () => {
    const response = await call('initialize', {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    })

    expect(response.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'philipithomas.com' },
    })
  })

  it('lists tools in deterministic order', async () => {
    const response = await call('tools/list')
    expect(response.result?.tools?.map((tool) => tool.name)).toEqual([
      'list_posts',
      'search_posts',
      'read_post',
    ])
  })

  it('paginates post lists with an opaque cursor', async () => {
    const first = await call('tools/call', {
      name: 'list_posts',
      arguments: { limit: 2 },
    })
    const firstPage = first.result?.structuredContent as {
      posts: Array<{ slug: string }>
      pagination: { nextCursor: string | null; total: number }
    }

    expect(firstPage.posts).toHaveLength(2)
    expect(firstPage.pagination.total).toBeGreaterThan(2)
    expect(firstPage.pagination.nextCursor).toEqual(expect.any(String))

    const second = await call('tools/call', {
      name: 'list_posts',
      arguments: { limit: 2, cursor: firstPage.pagination.nextCursor },
    })
    const secondPage = second.result?.structuredContent as {
      posts: Array<{ slug: string }>
    }

    expect(secondPage.posts).toHaveLength(2)
    expect(secondPage.posts.map((post) => post.slug)).not.toContain(
      firstPage.posts[0].slug
    )
  })

  it('rejects cursors used with different list arguments', async () => {
    const first = await call('tools/call', {
      name: 'list_posts',
      arguments: { limit: 1, newsletter: 'contraption' },
    })
    const page = first.result?.structuredContent as {
      pagination: { nextCursor: string }
    }

    const second = await call('tools/call', {
      name: 'list_posts',
      arguments: {
        limit: 1,
        newsletter: 'workshop',
        cursor: page.pagination.nextCursor,
      },
    })

    expect(second.error).toMatchObject({
      code: -32602,
      message: 'Cursor does not match these request arguments',
    })
  })

  it('returns full post content by slug', async () => {
    const list = await call('tools/call', {
      name: 'list_posts',
      arguments: { limit: 1 },
    })
    const page = list.result?.structuredContent as {
      posts: Array<{ slug: string; title: string }>
    }
    const firstPost = page.posts[0]

    const read = await call('tools/call', {
      name: 'read_post',
      arguments: { slug: firstPost.slug },
    })
    const post = read.result?.structuredContent as {
      title: string
      content: string
      outline: Array<{ url: string }>
    }

    expect(post.title).toBe(firstPost.title)
    expect(post.content.length).toBeGreaterThan(200)
    expect(
      post.outline.every((heading) => heading.url.startsWith('http'))
    ).toBe(true)
  })
})
