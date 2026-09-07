import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
const runtime = vi.hoisted(() => ({ start: vi.fn(), getRun: vi.fn() }))
vi.mock('workflow/api', () => runtime)
vi.mock('@/workflows/morning-report', () => ({
  morningReportWorkflow: vi.fn(),
}))

import { GET } from '@/app/api/cron/morning-report/route'
import {
  acceptMorningReport,
  getMorningReport,
  reserveMorningReport,
} from '@/lib/db/queries/morning-reports'
import { resetDb } from '@/test/integration/db'

const request = () =>
  new Request('https://example.com/api/cron/morning-report', {
    headers: { authorization: 'Bearer test-secret' },
  })
beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv('CRON_SECRET', 'test-secret')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-08T11:00:00Z'))
  runtime.start.mockResolvedValue({ runId: 'new-run' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('morning report cron', () => {
  it('authenticates before scheduling and never sends in preview', async () => {
    expect((await GET(new Request('https://example.com'))).status).toBe(401)
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(await (await GET(request())).json()).toEqual({
      skipped: 'production-only',
    })
    expect(runtime.start).not.toHaveBeenCalled()
  })
  it('does not refresh a success heartbeat outside the New York window', async () => {
    vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
    expect(await (await GET(request())).json()).toEqual({
      skipped: 'outside-morning-window',
    })
    expect(await getMorningReport('2026-09-08')).toBeNull()
  })
  it('starts only one run under duplicate cron invocations', async () => {
    const responses = await Promise.all([GET(request()), GET(request())])
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 202,
    ])
    expect(runtime.start).toHaveBeenCalledTimes(1)
  })
  it('retains active or unavailable owners and resumes the exact terminal owner', async () => {
    await reserveMorningReport('2026-09-08', 'old-token', null)
    await acceptMorningReport('2026-09-08', 'old-token', 'old-run')
    runtime.getRun.mockReturnValue({ status: Promise.resolve('running') })
    expect(await (await GET(request())).json()).toEqual({
      skipped: 'active-run',
    })
    runtime.getRun.mockReturnValue({
      get status() {
        return Promise.reject(new Error('unavailable'))
      },
    })
    expect((await GET(request())).status).toBe(503)
    expect((await getMorningReport('2026-09-08'))?.workflowRunId).toBe(
      'old-run'
    )
    runtime.getRun.mockReturnValue({ status: Promise.resolve('failed') })
    expect((await GET(request())).status).toBe(202)
  })
  it('respects cancellation without starting replacement mail', async () => {
    await reserveMorningReport('2026-09-08', 'cancel-token', null)
    await acceptMorningReport('2026-09-08', 'cancel-token', 'cancel-run')
    runtime.getRun.mockReturnValue({ status: Promise.resolve('cancelled') })
    expect(await (await GET(request())).json()).toEqual({
      skipped: 'cancelled',
    })
    expect(runtime.start).not.toHaveBeenCalled()
  })
  it('fences an ambiguous failed enqueue and permits the next cron attempt', async () => {
    runtime.start.mockRejectedValueOnce(new Error('timeout'))
    expect((await GET(request())).status).toBe(503)
    const token = runtime.start.mock.calls[0][1][1]
    expect(await acceptMorningReport('2026-09-08', token, 'late-run')).toBe(
      false
    )
    expect((await GET(request())).status).toBe(202)
  })
})
