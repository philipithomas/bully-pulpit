import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { GET as readPostGet } from '@/app/api/public/posts/[slug]/route'
import { GET as listPostsGet } from '@/app/api/public/posts/route'
import { GET as searchPostsGet } from '@/app/api/public/search/route'
import { GET as openApiGet } from '@/app/openapi.json/route'
import { siteConfig } from '@/lib/config'
import { getAllPosts } from '@/lib/content/loader'

vi.mock('@/lib/search/embedding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/embedding')>()
  return {
    ...actual,
    embedQuery: vi.fn(async () => {
      throw new Error('no network in tests')
    }),
  }
})

function request(url: string) {
  return new NextRequest(url)
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) }
}

function longReadablePost() {
  const posts = getAllPosts()
  const post =
    posts.find((candidate) => candidate.content.length > 200) ?? posts[0]
  if (!post) throw new Error('Expected at least one post')
  return post
}

describe('public API routes', () => {
  it('lists posts with cursor pagination and CORS headers', async () => {
    const response = listPostsGet(
      request('http://localhost:3000/api/public/posts?limit=2')
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const body = await response.json()
    expect(body.posts).toHaveLength(2)
    expect(body.posts[0]).toMatchObject({
      slug: expect.any(String),
      url: expect.stringMatching(/^https?:\/\//),
      newsletter: expect.any(String),
      title: expect.any(String),
    })
    expect(body.pagination).toMatchObject({
      limit: 2,
      total: expect.any(Number),
      nextCursor: expect.any(String),
    })
  })

  it('searches posts and rejects missing queries', async () => {
    const invalid = await searchPostsGet(
      request('http://localhost:3000/api/public/search')
    )
    expect(invalid.status).toBe(400)

    const firstPost = getAllPosts()[0]
    const query =
      firstPost.frontmatter.title
        .split(/\W+/)
        .find((part) => part.length > 2) ?? firstPost.slug

    const response = await searchPostsGet(
      request(
        `http://localhost:3000/api/public/search?q=${encodeURIComponent(query)}&limit=3`
      )
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.query).toBe(query)
    expect(body.results.length).toBeGreaterThan(0)
    expect(body.results[0]).toMatchObject({
      slug: expect.any(String),
      excerpts: expect.any(Array),
      score: expect.any(Number),
    })
  })

  it('reads one post by slug', async () => {
    const firstPost = longReadablePost()
    const response = await readPostGet(
      request(`http://localhost:3000/api/public/posts/${firstPost.slug}`),
      params(firstPost.slug)
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.slug).toBe(firstPost.slug)
    expect(body.content.length).toBeGreaterThan(200)
    expect(
      body.outline.every((heading: { url: string }) =>
        heading.url.startsWith(siteConfig.url)
      )
    ).toBe(true)
  })

  it('returns 404 for missing post slugs', async () => {
    const response = await readPostGet(
      request('http://localhost:3000/api/public/posts/missing'),
      params('missing')
    )

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toMatchObject({ code: 'not_found' })
  })
})

describe('OpenAPI route', () => {
  it('describes the no-auth public API', async () => {
    const response = openApiGet()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(body.openapi).toBe('3.1.0')
    expect(body.security).toEqual([])
    expect(body.paths).toHaveProperty('/api/public/posts')
    expect(body.paths).toHaveProperty('/api/public/search')
    expect(body.paths).toHaveProperty('/api/public/posts/{slug}')
    expect(
      body.paths['/api/public/posts'].get.parameters.some(
        (parameter: { name: string }) => parameter.name === 'cursor'
      )
    ).toBe(true)
  })
})
