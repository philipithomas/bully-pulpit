import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRun } from 'workflow/api'
import { WorkflowRunNotFoundError } from 'workflow/errors'
import {
  allLatestRuns,
  deleteSendRunIfMatches,
  latestRunBySlug,
  type RecordedSendRun,
} from '@/lib/db/queries/send-runs'
import {
  activeSendRunSlugs,
  isSendRunActive,
  SEND_RUN_NOT_FOUND_GRACE_MS,
} from '@/lib/email/send-guard'

vi.mock('workflow/api', () => ({ getRun: vi.fn() }))
vi.mock('@/lib/db/queries/send-runs', () => ({
  allLatestRuns: vi.fn(),
  deleteSendRunIfMatches: vi.fn(),
  latestRunBySlug: vi.fn(),
}))

const mockedGetRun = vi.mocked(getRun)
const mockedAllLatestRuns = vi.mocked(allLatestRuns)
const mockedDeleteSendRunIfMatches = vi.mocked(deleteSendRunIfMatches)
const mockedLatestRunBySlug = vi.mocked(latestRunBySlug)

type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

function runStatus(status: WorkflowRunStatus | Promise<WorkflowRunStatus>) {
  return {
    status: Promise.resolve(status),
  } as unknown as ReturnType<typeof getRun>
}

function recordedRun(
  postSlug: string,
  runId: string,
  ageMs = 0
): RecordedSendRun {
  return {
    postSlug,
    runId,
    startedAt: new Date(Date.now() - ageMs),
  }
}

beforeEach(() => {
  mockedGetRun.mockReset()
  mockedAllLatestRuns.mockReset()
  mockedDeleteSendRunIfMatches.mockReset()
  mockedDeleteSendRunIfMatches.mockResolvedValue(true)
  mockedLatestRunBySlug.mockReset()
})

describe('isSendRunActive', () => {
  it.each([
    'pending',
    'running',
  ] as const)('keeps a %s run recorded and reports it active', async (status) => {
    mockedLatestRunBySlug.mockResolvedValue(recordedRun('post', 'run-live'))
    mockedGetRun.mockReturnValue(runStatus(status))

    await expect(isSendRunActive('post')).resolves.toBe(true)

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })

  it.each([
    'completed',
    'failed',
    'cancelled',
  ] as const)('prunes a %s run and reports it inactive', async (status) => {
    mockedLatestRunBySlug.mockResolvedValue(recordedRun('post', 'run-terminal'))
    mockedGetRun.mockReturnValue(runStatus(status))

    await expect(isSendRunActive('post')).resolves.toBe(false)

    expect(mockedDeleteSendRunIfMatches).toHaveBeenCalledWith(
      'post',
      'run-terminal'
    )
  })

  it('keeps a recently accepted missing run active during resilient start', async () => {
    mockedLatestRunBySlug.mockResolvedValue(recordedRun('post', 'run-missing'))
    mockedGetRun.mockReturnValue(
      runStatus(Promise.reject(new WorkflowRunNotFoundError('run-missing')))
    )

    await expect(isSendRunActive('post')).resolves.toBe(true)

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })

  it('prunes a missing run after the resilient-start grace expires', async () => {
    mockedLatestRunBySlug.mockResolvedValue(
      recordedRun('post', 'run-missing', SEND_RUN_NOT_FOUND_GRACE_MS + 1)
    )
    mockedGetRun.mockReturnValue(
      runStatus(Promise.reject(new WorkflowRunNotFoundError('run-missing')))
    )

    await expect(isSendRunActive('post')).resolves.toBe(false)

    expect(mockedDeleteSendRunIfMatches).toHaveBeenCalledWith(
      'post',
      'run-missing'
    )
  })

  it('keeps the row and fails closed when status lookup fails transiently', async () => {
    const failure = new Error('Workflow backend unavailable')
    mockedLatestRunBySlug.mockResolvedValue(recordedRun('post', 'run-unknown'))
    mockedGetRun.mockReturnValue(runStatus(Promise.reject(failure)))

    await expect(isSendRunActive('post')).rejects.toBe(failure)

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })

  it('keeps the row and fails closed on an unknown future status', async () => {
    mockedLatestRunBySlug.mockResolvedValue(recordedRun('post', 'run-future'))
    mockedGetRun.mockReturnValue(runStatus('paused' as WorkflowRunStatus))

    await expect(isSendRunActive('post')).rejects.toThrow(
      'Unknown Workflow run status: paused'
    )

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })
})

describe('activeSendRunSlugs', () => {
  it('prunes proven-dead rows but preserves unknown runs as active', async () => {
    mockedAllLatestRuns.mockResolvedValue([
      recordedRun('post-running', 'run-running'),
      recordedRun('post-pending', 'run-pending'),
      recordedRun('post-completed', 'run-completed'),
      recordedRun('post-failed', 'run-failed'),
      recordedRun('post-cancelled', 'run-cancelled'),
      recordedRun('post-missing-recent', 'run-missing-recent'),
      recordedRun(
        'post-missing-stale',
        'run-missing-stale',
        SEND_RUN_NOT_FOUND_GRACE_MS + 1
      ),
      recordedRun('post-unknown', 'run-unknown'),
    ])
    mockedGetRun.mockImplementation((runId) => {
      const status = runId.replace('run-', '')
      if (status.startsWith('missing')) {
        return runStatus(Promise.reject(new WorkflowRunNotFoundError(runId)))
      }
      if (status === 'unknown') {
        return runStatus(Promise.reject(new Error('temporary outage')))
      }
      return runStatus(status as WorkflowRunStatus)
    })
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    await expect(activeSendRunSlugs()).resolves.toEqual(
      new Set([
        'post-running',
        'post-pending',
        'post-missing-recent',
        'post-unknown',
      ])
    )

    expect(mockedDeleteSendRunIfMatches.mock.calls).toEqual(
      expect.arrayContaining([
        ['post-completed', 'run-completed'],
        ['post-failed', 'run-failed'],
        ['post-cancelled', 'run-cancelled'],
        ['post-missing-stale', 'run-missing-stale'],
      ])
    )
    expect(mockedDeleteSendRunIfMatches).toHaveBeenCalledTimes(4)
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('limits the one-time historical cleanup to eight concurrent probes', async () => {
    const runs = Array.from({ length: 18 }, (_, index) =>
      recordedRun(`post-${index}`, `run-${index}`)
    )
    mockedAllLatestRuns.mockResolvedValue(runs)
    const resolveStatus: Array<(status: WorkflowRunStatus) => void> = []
    mockedGetRun.mockImplementation(() =>
      runStatus(
        new Promise<WorkflowRunStatus>((resolve) => {
          resolveStatus.push(resolve)
        })
      )
    )

    const result = activeSendRunSlugs()

    await vi.waitFor(() => expect(mockedGetRun).toHaveBeenCalledTimes(8))
    resolveStatus.slice(0, 8).forEach((resolve) => {
      resolve('completed')
    })
    await vi.waitFor(() => expect(mockedGetRun).toHaveBeenCalledTimes(16))
    resolveStatus.slice(8, 16).forEach((resolve) => {
      resolve('completed')
    })
    await vi.waitFor(() => expect(mockedGetRun).toHaveBeenCalledTimes(18))
    resolveStatus.slice(16).forEach((resolve) => {
      resolve('completed')
    })

    await expect(result).resolves.toEqual(new Set())
  })
})
