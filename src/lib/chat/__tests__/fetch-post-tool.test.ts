import { describe, expect, it } from 'vitest'
import { fetchPost } from '@/lib/chat/fetch-post-tool'

const callOptions = { toolCallId: 'test-call', messages: [], context: {} }

interface FetchPostOutput {
  title: string
  outline: { heading: string; anchor: string; url: string }[]
  content: string
  error?: string
}

async function run(slug: string): Promise<FetchPostOutput> {
  const out = await fetchPost.execute!({ slug }, callOptions)
  return JSON.parse(out as string) as FetchPostOutput
}

describe('fetchPost tool outline', () => {
  it('returns the heading outline with anchors and section urls', async () => {
    const result = await run('finding-a-software-job')
    expect(result.error).toBeUndefined()
    expect(result.outline.length).toBeGreaterThan(0)

    const timeline = result.outline.find((h) => h.heading === 'Timeline')
    expect(timeline).toEqual({
      heading: 'Timeline',
      anchor: 'timeline',
      url: '/finding-a-software-job#timeline',
    })

    // Punctuation in heading text is stripped from the anchor
    const didNotWork = result.outline.find(
      (h) => h.anchor === 'what-didnt-work-in-my-process'
    )
    expect(didNotWork).toBeDefined()
    expect(didNotWork!.url).toBe(
      '/finding-a-software-job#what-didnt-work-in-my-process'
    )

    for (const entry of result.outline) {
      expect(entry.url).toBe(`/finding-a-software-job#${entry.anchor}`)
    }
  })

  it('builds outlines for pages too', async () => {
    const result = await run('colophon')
    expect(result.error).toBeUndefined()
    expect(result.outline.length).toBeGreaterThan(0)
    for (const entry of result.outline) {
      expect(entry.url).toBe(`/colophon#${entry.anchor}`)
    }
  })

  it('returns the same complete Stargazing content that search indexes', async () => {
    const result = await run('stargazing')
    expect(result.error).toBeUndefined()
    expect(result.content).toContain('SingleThread | Healdsburg')
    expect(result.content).toContain('Takumi Tatsuhiro | Tokyo')
    expect(result.outline).toContainEqual({
      heading: 'How I count',
      anchor: 'how-i-count',
      url: '/stargazing#how-i-count',
    })
    expect(result.outline).toContainEqual({
      heading: 'Restaurants',
      anchor: 'restaurants',
      url: '/stargazing#restaurants',
    })
  })

  it('returns an empty outline for content without headings', async () => {
    const result = await run('workshop-welcome')
    expect(result.error).toBeUndefined()
    expect(result.outline).toEqual([])
  })
})
