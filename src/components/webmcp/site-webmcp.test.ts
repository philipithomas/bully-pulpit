import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => undefined | (() => void)>,
  openSidebar: vi.fn(),
  registerSiteWebMcpTools: vi.fn(),
}))

vi.mock('react', () => ({
  useEffect: (effect: () => undefined | (() => void)) => {
    harness.effects.push(effect)
  },
}))

vi.mock('@/lib/webmcp/site-tools', () => ({
  registerSiteWebMcpTools: harness.registerSiteWebMcpTools,
}))

vi.mock('@/stores/chat-store', () => ({
  useChatSidebar: {
    getState: () => ({ openSidebar: harness.openSidebar }),
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  harness.effects.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SiteWebMcp', () => {
  it('is a silent no-op when the browser API is unavailable', async () => {
    vi.stubGlobal('document', {})
    const { SiteWebMcp } = await import('@/components/webmcp/site-webmcp')

    expect(SiteWebMcp()).toBeNull()
    expect(harness.effects).toHaveLength(1)
    expect(harness.effects[0]?.()).toBeUndefined()
    expect(harness.registerSiteWebMcpTools).not.toHaveBeenCalled()
  })

  it('registers tools, wires Bell to the visible sidebar, and cleans up', async () => {
    const abort = vi.fn()
    const modelContext = { registerTool: vi.fn() }
    harness.registerSiteWebMcpTools.mockReturnValue({
      abort,
      ready: Promise.resolve([]),
      signal: new AbortController().signal,
    })
    vi.stubGlobal('document', { modelContext })
    vi.stubGlobal('window', {
      location: { origin: 'https://www.philipithomas.com' },
    })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { SiteWebMcp } = await import('@/components/webmcp/site-webmcp')

    SiteWebMcp()
    const cleanup = harness.effects[0]?.()
    await vi.waitFor(() =>
      expect(harness.registerSiteWebMcpTools).toHaveBeenCalled()
    )
    const dependencies = harness.registerSiteWebMcpTools.mock.calls[0]?.[1]

    expect(harness.registerSiteWebMcpTools).toHaveBeenCalledWith(
      modelContext,
      expect.objectContaining({
        origin: 'https://www.philipithomas.com',
      })
    )
    await dependencies.fetch('/api/search')
    expect(fetch).toHaveBeenCalledWith('/api/search', undefined)
    dependencies.startBellQuestion('Where did Philip travel?')
    expect(harness.openSidebar).toHaveBeenCalledWith('Where did Philip travel?')

    cleanup?.()
    expect(abort).toHaveBeenCalledOnce()
  })

  it('does not register after cleanup wins the dynamic import race', async () => {
    const modelContext = { registerTool: vi.fn() }
    vi.stubGlobal('document', { modelContext })
    vi.stubGlobal('window', {
      location: { origin: 'https://www.philipithomas.com' },
    })
    const { SiteWebMcp } = await import('@/components/webmcp/site-webmcp')

    SiteWebMcp()
    const cleanup = harness.effects[0]?.()
    cleanup?.()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(harness.registerSiteWebMcpTools).not.toHaveBeenCalled()
  })
})
