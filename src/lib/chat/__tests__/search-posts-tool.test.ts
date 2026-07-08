import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostResult } from '@/lib/chat/search-posts-tool'
import { searchPosts } from '@/lib/chat/search-posts-tool'

// Force the BM25-only degradation path: no network in tests, and the lexical
// half plus section attribution are deterministic over the real content.
vi.mock('@/lib/search/embedding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search/embedding')>()
  return {
    ...actual,
    embedQuery: vi.fn(async () => {
      throw new Error('no network in tests')
    }),
  }
})

const callOptions = { toolCallId: 'test-call', messages: [], context: {} }

async function run(
  query: string,
  scope?: 'posts' | 'images'
): Promise<PostResult[]> {
  const input = { query, scope: scope ?? 'posts' }
  const out = await searchPosts.execute!(input, callOptions)
  return JSON.parse(out as string) as PostResult[]
}

describe('searchPosts tool output', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns posts with excerpt objects and optional sections', async () => {
    const results = await run('software engineering job search timeline')
    expect(results.length).toBeGreaterThan(0)

    for (const result of results) {
      expect(typeof result.title).toBe('string')
      expect(result.type).toMatch(/^(post|page|image)$/)
      expect(result.url).toMatch(/^\/[a-z0-9-]+$/)
      expect(typeof result.newsletter).toBe('string')
      expect(typeof result.coverImage).toBe('string')
      expect(Array.isArray(result.excerpts)).toBe(true)
      expect(Array.isArray(result.images)).toBe(true)
      for (const excerpt of result.excerpts) {
        expect(typeof excerpt.text).toBe('string')
        expect(excerpt.text.length).toBeGreaterThan(0)
        if (excerpt.section) {
          expect(typeof excerpt.section.heading).toBe('string')
          // Section url is the post url plus a heading anchor
          expect(excerpt.section.url.startsWith(`${result.url}#`)).toBe(true)
          expect(excerpt.section.url).toMatch(/#[a-z0-9][a-z0-9_-]*$/)
        }
      }
    }
  })

  it('can return direct image results for photo questions', async () => {
    const results = await run('coffee photo', 'images')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].type).toBe('image')
    expect(results[0].image?.src).toMatch(/^\/images\//)
    expect(results[0].images[0]?.src).toBe(results[0].image?.src)
  })

  it('returns content pages for site-page queries', async () => {
    const results = await run('contact telephone')
    const contact = results.find((result) => result.url === '/contact')

    expect(contact).toMatchObject({
      type: 'page',
      title: 'Contact',
      newsletter: 'page',
      coverImage: '',
    })
    expect(
      contact?.excerpts.map((excerpt) => excerpt.text).join(' ')
    ).toContain('+1 212 347 3190')
  })

  it('cites the section for excerpts that sit under a heading', async () => {
    const results = await run('software engineering job search timeline')
    const post = results.find((r) => r.url === '/finding-a-software-job')
    expect(post).toBeDefined()
    const withSection = post!.excerpts.filter((e) => e.section)
    expect(withSection.length).toBeGreaterThan(0)
    for (const excerpt of withSection) {
      expect(excerpt.section!.url).toMatch(
        /^\/finding-a-software-job#[a-z0-9][a-z0-9_-]*$/
      )
    }
  })
})
