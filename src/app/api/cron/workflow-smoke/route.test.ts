import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('workflow/api', () => ({ start: vi.fn(), getRun: vi.fn() }))
vi.mock('@/workflows/bell-smoke', () => ({ bellSmokeWorkflow: vi.fn() }))

import { getRun, start } from 'workflow/api'
import { POST } from '@/app/api/cron/workflow-smoke/route'
import { bellSmokeWorkflow } from '@/workflows/bell-smoke'
import { workflowSmokeWorkflow } from '@/workflows/workflow-smoke'

const mockedStart = vi.mocked(start)
const mockedGetRun = vi.mocked(getRun)

function request(auth?: string, query = '') {
  return new Request(`http://localhost/api/cron/workflow-smoke${query}`, {
    method: 'POST',
    headers: auth ? { authorization: auth } : undefined,
  })
}

function stubStatus(status: string) {
  mockedGetRun.mockReturnValue({
    status: Promise.resolve(status),
  } as unknown as ReturnType<typeof getRun>)
}

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  process.env.WORKFLOW_SMOKE_TIMEOUT_MS = '0'
  process.env.WORKFLOW_SMOKE_POLL_MS = '0'
  mockedStart.mockReset()
  mockedStart.mockResolvedValue({ runId: 'run-1' } as Awaited<
    ReturnType<typeof start>
  >)
  mockedGetRun.mockReset()
  stubStatus('completed')
})

describe('POST workflow smoke', () => {
  it('requires the cron bearer token', async () => {
    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('starts the no-op workflow and returns success when it completes', async () => {
    const res = await POST(request('Bearer test-cron-secret'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      runId: 'run-1',
      status: 'completed',
    })
    expect(mockedStart).toHaveBeenCalledWith(workflowSmokeWorkflow, [
      expect.stringMatching(/^workflow-smoke-/),
    ])
  })

  it('fails when the smoke run stays pending', async () => {
    stubStatus('pending')

    const res = await POST(request('Bearer test-cron-secret'))

    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({
      ok: false,
      runId: 'run-1',
      status: 'pending',
    })
  })

  it('authenticates the Bell probe before starting a model call', async () => {
    expect((await POST(request(undefined, '?mode=bell'))).status).toBe(401)
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('runs the delivery-free Bell probe and returns its verification result', async () => {
    const bell = {
      model: 'test-model',
      steps: 2,
      archiveRead: true,
      zeroDataRetention: true,
    }
    mockedGetRun.mockReturnValue({
      status: Promise.resolve('completed'),
      returnValue: Promise.resolve(bell),
    } as unknown as ReturnType<typeof getRun>)
    const response = await POST(
      request('Bearer test-cron-secret', '?mode=bell')
    )
    expect(mockedStart).toHaveBeenCalledWith(bellSmokeWorkflow, [])
    expect(await response.json()).toEqual({
      ok: true,
      runId: 'run-1',
      status: 'completed',
      bell,
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('rejects unknown modes without enqueuing work', async () => {
    expect(
      (await POST(request('Bearer test-cron-secret', '?mode=unknown'))).status
    ).toBe(400)
    expect(mockedStart).not.toHaveBeenCalled()
  })

  it('does not report a failed Bell run as healthy', async () => {
    stubStatus('failed')
    const response = await POST(
      request('Bearer test-cron-secret', '?mode=bell')
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      runId: 'run-1',
      status: 'failed',
    })
  })
})
