import { describe, expect, it } from 'vitest'
import { fetchPage } from '@/lib/chat/fetch-page-tool'

const callOptions = { toolCallId: 'test-call', messages: [], context: {} }

interface FetchPageOutput {
  type?: 'post' | 'page'
  title?: string
  url?: string
  publishedAt?: string | null
  newsletter?: string
  content?: string
  error?: string
}

async function run(path: string): Promise<FetchPageOutput> {
  const out = await fetchPage.execute!({ path }, callOptions)
  return JSON.parse(out as string) as FetchPageOutput
}

describe('fetchPage tool provenance', () => {
  it('returns structured metadata with newsletter page text', async () => {
    await expect(run('/workshop')).resolves.toMatchObject({
      type: 'page',
      title: 'Workshop',
      url: '/workshop',
      publishedAt: null,
      newsletter: 'workshop',
    })
    expect((await run('/workshop')).content).toContain('Most recent posts:')
  })

  it('includes dates for post paths', async () => {
    const result = await run('/finding-a-software-job')
    expect(result).toMatchObject({
      type: 'post',
      title: 'What worked for finding a software engineering job',
      url: '/finding-a-software-job',
      newsletter: 'contraption',
    })
    expect(result.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('does not create provenance for missing pages', async () => {
    const result = await run('/missing-page-for-bell-test')
    expect(result.error).toContain('No page exists')
    expect(result.url).toBeUndefined()
  })
})
