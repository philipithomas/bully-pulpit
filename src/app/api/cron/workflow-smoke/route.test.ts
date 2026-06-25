import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('workflow/api', () => ({ start: vi.fn(), getRun: vi.fn() }))

import { getRun, start } from 'workflow/api'
import { POST } from '@/app/api/cron/workflow-smoke/route'
import { workflowSmokeWorkflow } from '@/workflows/workflow-smoke'

const mockedStart = vi.mocked(start)
const mockedGetRun = vi.mocked(getRun)

function request(auth?: string) {
  return new Request('http://localhost/api/cron/workflow-smoke', {
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
})
