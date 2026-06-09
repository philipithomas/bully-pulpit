import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Without the Workflow compiler the directives are no-ops; stub
// getStepMetadata which throws outside the runtime.
vi.mock('workflow', async (importActual) => {
  const actual = await importActual<typeof import('workflow')>()
  return {
    ...actual,
    getStepMetadata: vi.fn(() => ({ attempt: 1 })),
  }
})

vi.mock('@/lib/db/queries/subscribers', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/db/queries/subscribers')>()
  return {
    ...actual,
    syncFromLegacy: vi.fn(),
  }
})

import { syncFromLegacy } from '@/lib/db/queries/subscribers'
import { syncPrintingPressWorkflow } from '@/workflows/sync-printing-press'

const mockedSync = vi.mocked(syncFromLegacy)
const fetchMock = vi.fn()

function apiSubscriber(id: number, email: string) {
  return {
    id,
    uuid: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    email,
    name: null,
    confirmed_at: '2025-01-01T00:00:00Z',
    subscribed_postcard: true,
    subscribed_contraption: true,
    subscribed_workshop: false,
    source: 'homepage',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }
}

function page(subscribers: ReturnType<typeof apiSubscriber>[], total: number) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ subscribers, total }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('M2M_API_KEY', 'test-m2m-key')
  mockedSync.mockResolvedValue({ created: 0, updated: 0, unchanged: 0 })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('syncPrintingPressWorkflow', () => {
  it('pages by keyset until a short page and accumulates counts', async () => {
    // PAGE_SIZE is 500, so build a full page then a short one.
    const fullPage = Array.from({ length: 500 }, (_, i) =>
      apiSubscriber(i + 1, `s${i + 1}@example.com`)
    )
    const shortPage = [apiSubscriber(501, 's501@example.com')]
    fetchMock
      .mockResolvedValueOnce(page(fullPage, 501))
      .mockResolvedValueOnce(page(shortPage, 501))
    mockedSync
      .mockResolvedValueOnce({ created: 400, updated: 50, unchanged: 50 })
      .mockResolvedValueOnce({ created: 1, updated: 0, unchanged: 0 })

    const result = await syncPrintingPressWorkflow()

    expect(result).toEqual({
      pages: 2,
      created: 401,
      updated: 50,
      unchanged: 50,
      legacyTotal: 501,
    })
    // Keyset advance: second request starts after the last id of page one.
    expect(fetchMock.mock.calls[0][0]).toContain('after_id=0')
    expect(fetchMock.mock.calls[1][0]).toContain('after_id=500')
    // M2M key is sent on every request.
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('test-m2m-key')
    // Rows are converted to the query layer's camelCase/Date shape.
    const mapped = mockedSync.mock.calls[0][0][0]
    expect(mapped.email).toBe('s1@example.com')
    expect(mapped.confirmedAt).toEqual(new Date('2025-01-01T00:00:00Z'))
    expect(mapped.subscribedWorkshop).toBe(false)
  })

  it('finishes immediately on an empty export', async () => {
    fetchMock.mockResolvedValueOnce(page([], 0))

    const result = await syncPrintingPressWorkflow()

    expect(result).toEqual({
      pages: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      legacyTotal: 0,
    })
    expect(mockedSync).not.toHaveBeenCalled()
  })

  it('fails fatally when the M2M key is rejected', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 })

    await expect(syncPrintingPressWorkflow()).rejects.toThrow(
      'Legacy API rejected the M2M key'
    )
  })

  it('retries transient legacy errors with backoff', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })

    await expect(syncPrintingPressWorkflow()).rejects.toMatchObject({
      name: 'RetryableError',
    })
  })
})
