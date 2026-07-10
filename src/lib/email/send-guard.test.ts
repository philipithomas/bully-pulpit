import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getRun } from 'workflow/api'
import { WorkflowRunNotFoundError } from 'workflow/errors'
import {
  allLatestRunIds,
  deleteSendRunIfMatches,
  latestRunIdBySlug,
} from '@/lib/db/queries/send-runs'
import { activeSendRunSlugs, isSendRunActive } from '@/lib/email/send-guard'

vi.mock('workflow/api', () => ({ getRun: vi.fn() }))
vi.mock('@/lib/db/queries/send-runs', () => ({
  allLatestRunIds: vi.fn(),
  deleteSendRunIfMatches: vi.fn(),
  latestRunIdBySlug: vi.fn(),
}))

const mockedGetRun = vi.mocked(getRun)
const mockedAllLatestRunIds = vi.mocked(allLatestRunIds)
const mockedDeleteSendRunIfMatches = vi.mocked(deleteSendRunIfMatches)
const mockedLatestRunIdBySlug = vi.mocked(latestRunIdBySlug)

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

beforeEach(() => {
  mockedGetRun.mockReset()
  mockedAllLatestRunIds.mockReset()
  mockedDeleteSendRunIfMatches.mockReset()
  mockedDeleteSendRunIfMatches.mockResolvedValue(true)
  mockedLatestRunIdBySlug.mockReset()
})

describe('isSendRunActive', () => {
  it.each([
    'pending',
    'running',
  ] as const)('keeps a %s run recorded and reports it active', async (status) => {
    mockedLatestRunIdBySlug.mockResolvedValue('run-live')
    mockedGetRun.mockReturnValue(runStatus(status))

    await expect(isSendRunActive('post')).resolves.toBe(true)

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })

  it.each([
    'completed',
    'failed',
    'cancelled',
  ] as const)('prunes a %s run and reports it inactive', async (status) => {
    mockedLatestRunIdBySlug.mockResolvedValue('run-terminal')
    mockedGetRun.mockReturnValue(runStatus(status))

    await expect(isSendRunActive('post')).resolves.toBe(false)

    expect(mockedDeleteSendRunIfMatches).toHaveBeenCalledWith(
      'post',
      'run-terminal'
    )
  })

  it('prunes a run the Workflow runtime no longer knows', async () => {
    mockedLatestRunIdBySlug.mockResolvedValue('run-missing')
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
    mockedLatestRunIdBySlug.mockResolvedValue('run-unknown')
    mockedGetRun.mockReturnValue(runStatus(Promise.reject(failure)))

    await expect(isSendRunActive('post')).rejects.toBe(failure)

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })

  it('keeps the row and fails closed on an unknown future status', async () => {
    mockedLatestRunIdBySlug.mockResolvedValue('run-future')
    mockedGetRun.mockReturnValue(runStatus('paused' as WorkflowRunStatus))

    await expect(isSendRunActive('post')).rejects.toThrow(
      'Unknown Workflow run status: paused'
    )

    expect(mockedDeleteSendRunIfMatches).not.toHaveBeenCalled()
  })
})

describe('activeSendRunSlugs', () => {
  it('prunes proven-dead rows but preserves unknown runs as active', async () => {
    mockedAllLatestRunIds.mockResolvedValue({
      'post-running': 'run-running',
      'post-pending': 'run-pending',
      'post-completed': 'run-completed',
      'post-failed': 'run-failed',
      'post-cancelled': 'run-cancelled',
      'post-missing': 'run-missing',
      'post-unknown': 'run-unknown',
    })
    mockedGetRun.mockImplementation((runId) => {
      const status = runId.replace('run-', '')
      if (status === 'missing') {
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
      new Set(['post-running', 'post-pending', 'post-unknown'])
    )

    expect(mockedDeleteSendRunIfMatches.mock.calls).toEqual(
      expect.arrayContaining([
        ['post-completed', 'run-completed'],
        ['post-failed', 'run-failed'],
        ['post-cancelled', 'run-cancelled'],
        ['post-missing', 'run-missing'],
      ])
    )
    expect(mockedDeleteSendRunIfMatches).toHaveBeenCalledTimes(4)
    expect(consoleError).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })

  it('limits the one-time historical cleanup to eight concurrent probes', async () => {
    const runs = Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [
        `post-${index}`,
        `run-${index}`,
      ])
    )
    mockedAllLatestRunIds.mockResolvedValue(runs)
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
