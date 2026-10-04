import { describe, expect, it, vi } from 'vitest'
import type { WebMCP } from 'webmcp-types'
import {
  createSiteWebMcpTools,
  registerSiteWebMcpTools,
  WEBMCP_BELL_QUESTION_MAX_CHARACTERS,
  WEBMCP_OUTPUT_MAX_CHARACTERS,
} from '@/lib/webmcp/site-tools'

const SITE_ORIGIN = 'https://www.philipithomas.com'

function toolHarness() {
  const fetch = vi.fn()
  const startBellQuestion = vi.fn()
  const tools = createSiteWebMcpTools({
    fetch,
    origin: SITE_ORIGIN,
    startBellQuestion,
  })

  return {
    bell: tools[1],
    fetch,
    search: tools[0],
    startBellQuestion,
  }
}

describe('site WebMCP tools', () => {
  it('registers a small annotated tool set and aborts both registrations', async () => {
    const registrations: Array<{
      options?: WebMCP.ModelContextRegisterToolOptions
      tool: WebMCP.ModelContextTool
    }> = []
    const registerTool = vi.fn(
      (
        tool: WebMCP.ModelContextTool,
        options?: WebMCP.ModelContextRegisterToolOptions
      ) => {
        registrations.push({ tool, options })
        return Promise.resolve()
      }
    )
    const modelContext = {
      registerTool,
    } as unknown as Pick<WebMCP.ModelContext, 'registerTool'>

    const registration = registerSiteWebMcpTools(modelContext, {
      fetch: vi.fn(),
      origin: SITE_ORIGIN,
      startBellQuestion: vi.fn(),
    })
    await registration.ready

    expect(registrations.map(({ tool }) => tool.name)).toEqual([
      'search_philip_site',
      'start_bell_question',
    ])
    expect(registrations).toHaveLength(2)
    for (const { options, tool } of registrations) {
      expect(tool.name).toMatch(/^[a-z0-9_.-]{1,30}$/)
      expect(tool.description.length).toBeLessThanOrEqual(500)
      expect(options).toEqual({ signal: registration.signal })
      expect(options).not.toHaveProperty('exposedTo')
    }
    expect(registrations[0]?.tool.annotations).toMatchObject({
      readOnlyHint: true,
      consequentialHint: false,
      untrustedContentHint: false,
    })
    expect(registrations[1]?.tool.annotations).toMatchObject({
      readOnlyHint: false,
      consequentialHint: false,
      untrustedContentHint: false,
    })

    registration.abort()
    expect(registration.signal.aborted).toBe(true)
  })

  it('searches the existing browser API, forwards cancellation, and bounds output', async () => {
    const { fetch, search } = toolHarness()
    fetch.mockResolvedValue(
      Response.json({
        results: Array.from({ length: 8 }, (_, index) => ({
          title: `Result ${index} ${'T'.repeat(200)}`,
          url:
            index === 6
              ? 'https://attacker.example/injected'
              : `/post-${index}`,
          type: index === 2 ? 'image' : 'post',
          description: `Description ${index}`,
          excerpts: [`Excerpt ${index} ${'E'.repeat(400)}`],
        })),
      })
    )
    const signal = new AbortController().signal

    const output = (await search.execute(
      { query: '  coffee shops  ', scope: 'images' },
      { signal }
    )) as {
      hasMore: boolean
      results: Array<{ title: string; url: string }>
    }

    expect(fetch).toHaveBeenCalledWith(
      '/api/search?q=coffee+shops&scope=images',
      { signal }
    )
    expect(output.results.length).toBeGreaterThan(0)
    expect(output.results.length).toBeLessThanOrEqual(5)
    expect(output.results[0]?.url).toBe(`${SITE_ORIGIN}/post-0`)
    expect(output.results.every(({ url }) => url.startsWith(SITE_ORIGIN))).toBe(
      true
    )
    expect(output.hasMore).toBe(true)
    expect(JSON.stringify(output).length).toBeLessThanOrEqual(
      WEBMCP_OUTPUT_MAX_CHARACTERS
    )
  })

  it('rejects malformed search calls before fetching', async () => {
    const { fetch, search } = toolHarness()
    const options = { signal: new AbortController().signal }

    await expect(search.execute({ query: 'x' }, options)).rejects.toThrow(
      'between 2 and 300'
    )
    await expect(
      search.execute(
        { query: 'coffee', scope: 'posts', unexpected: true } as never,
        options
      )
    ).rejects.toThrow('only query and scope')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('opens Bell visibly with a trimmed question and describes initiation only', async () => {
    const { bell, startBellQuestion } = toolHarness()

    const output = await bell.execute(
      { question: '  What did Philip write about public space?  ' },
      { signal: new AbortController().signal }
    )

    expect(startBellQuestion).toHaveBeenCalledWith(
      'What did Philip write about public space?'
    )
    expect(output).toEqual({
      status: 'started',
      surface: 'Bell AI sidebar',
      message: 'Bell is answering in the visible site interface.',
    })
  })

  it('rejects oversized Bell questions without opening the UI', () => {
    const { bell, startBellQuestion } = toolHarness()

    expect(() =>
      bell.execute(
        { question: 'x'.repeat(WEBMCP_BELL_QUESTION_MAX_CHARACTERS + 1) },
        { signal: new AbortController().signal }
      )
    ).toThrow('between 1 and 2000')
    expect(startBellQuestion).not.toHaveBeenCalled()
  })
})
