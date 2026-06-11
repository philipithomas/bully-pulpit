import { describe, expect, it } from 'vitest'
import { getSystemPrompt } from '@/lib/chat/system-prompt'

describe('getSystemPrompt page context', () => {
  it('points fetchPage at the homepage path', () => {
    const prompt = getSystemPrompt({ pageContext: { path: '/' } })
    expect(prompt).toContain('The visitor is currently on /')
    expect(prompt).toContain('fetchPage with path "/"')
    expect(prompt).not.toContain('<current-page-content>')
  })

  it('injects page content between markers when provided', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/some-post', title: 'Some post' },
      pageContent: {
        slug: 'some-post',
        title: 'Some post',
        content: 'The full body of the post.',
        truncated: false,
      },
    })
    expect(prompt).toContain('"Some post" (/some-post)')
    expect(prompt).toContain(
      '<current-page-content>\nThe full body of the post.\n</current-page-content>'
    )
    expect(prompt).toContain('answer directly from it without calling tools')
    expect(prompt).not.toContain('use fetchPost with slug')
  })

  it('adds the fetchPost fallback when the content is truncated', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/some-post' },
      pageContent: {
        slug: 'some-post',
        title: 'Some post',
        content: 'Truncated body',
        truncated: true,
      },
    })
    expect(prompt).toContain('The content below is truncated')
    expect(prompt).toContain('use fetchPost with slug "some-post"')
  })

  it('points fetchPage at the path when no content is available', () => {
    const prompt = getSystemPrompt({
      pageContext: { path: '/unknown-page', title: 'Unknown' },
    })
    expect(prompt).toContain('fetchPage with path "/unknown-page"')
    expect(prompt).toContain('(page title: "Unknown")')
    expect(prompt).not.toContain('<current-page-content>')
  })

  it('omits the current page section without a path', () => {
    const prompt = getSystemPrompt()
    expect(prompt).not.toContain('## Current page')
  })
})
