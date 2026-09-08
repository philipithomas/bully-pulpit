import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('workflow', async (importActual) => ({
  ...(await importActual<typeof import('workflow')>()),
  getWorkflowMetadata: vi.fn(),
  getStepMetadata: vi.fn(() => ({ attempt: 1 })),
}))
vi.mock('@/lib/morning-report/copy', () => ({
  generateMorningReportCopy: vi.fn(),
}))
vi.mock('@/lib/email/ses', () => ({ sendSimpleEmail: vi.fn() }))

import { getWorkflowMetadata } from 'workflow'
import {
  getMorningReport,
  morningReportDeliveryPending,
  reserveMorningReport,
} from '@/lib/db/queries/morning-reports'
import { morningReportDeliveries } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { generateMorningReportCopy } from '@/lib/morning-report/copy'
import { db, resetDb } from '@/test/integration/db'
import { morningReportWorkflow } from '@/workflows/morning-report'

const date = '2026-09-08'
beforeEach(async () => {
  await resetDb()
  vi.clearAllMocks()
  vi.stubEnv('VERCEL_ENV', 'production')
  vi.stubEnv(
    'ADMIN_EMAILS',
    'first@example.com,second@example.com,first@example.com'
  )
  vi.mocked(getWorkflowMetadata).mockReturnValue({
    workflowRunId: 'run1',
  } as ReturnType<typeof getWorkflowMetadata>)
  vi.mocked(generateMorningReportCopy).mockResolvedValue({
    copy: {
      subject: 'A good morning',
      preheader: 'A small discovery',
      introduction: 'Good morning.',
    },
    model: 'openai/gpt-6-astra',
    generationId: 'generation',
  })
  vi.mocked(sendSimpleEmail).mockResolvedValue()
  await reserveMorningReport(date, 'token1', null)
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('durable morning report delivery', () => {
  it('sends one matching HTML/text snapshot per distinct admin and completes', async () => {
    await expect(morningReportWorkflow(date, 'token1')).resolves.toBe('sent')
    expect(sendSimpleEmail).toHaveBeenCalledTimes(2)
    const report = await getMorningReport(date)
    expect(report?.completedAt).toBeInstanceOf(Date)
    expect(report?.email?.model).toBe('openai/gpt-6-astra')
    expect(sendSimpleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'first@example.com',
        subject: report!.email!.subject,
        html: report!.email!.html,
        text: report!.email!.text,
      })
    )
    await expect(morningReportWorkflow(date, 'token1')).resolves.toBe(
      'duplicate'
    )
    expect(sendSimpleEmail).toHaveBeenCalledTimes(2)
  })

  it('uses useful deterministic copy when generation exhausts retries', async () => {
    vi.mocked(generateMorningReportCopy).mockRejectedValue(
      new Error('generation retries exhausted')
    )
    await expect(morningReportWorkflow(date, 'token1')).resolves.toBe('sent')
    const report = await getMorningReport(date)
    expect(report?.email?.subject).toContain(report!.content!.word.term)
    expect(report?.email?.model).toBeNull()
    expect(report?.email?.text).toContain(report!.content!.contraption.url)
    expect(sendSimpleEmail).toHaveBeenCalledTimes(2)
  })

  it('continues valid admins after a rejection and resumes only pending recipients with the same rendered copy', async () => {
    vi.mocked(sendSimpleEmail).mockRejectedValueOnce(
      Object.assign(new Error('Rejected'), { name: 'MessageRejected' })
    )
    await expect(morningReportWorkflow(date, 'token1')).rejects.toThrow(
      'failed recipients'
    )
    expect(sendSimpleEmail).toHaveBeenCalledTimes(2)
    expect(
      await morningReportDeliveryPending(date, 'run1', 'second@example.com')
    ).toBe(false)
    const firstReport = await getMorningReport(date)
    expect(firstReport?.completedAt).toBeNull()
    await reserveMorningReport(date, 'token2', 'run1')
    vi.mocked(getWorkflowMetadata).mockReturnValue({
      workflowRunId: 'run2',
    } as ReturnType<typeof getWorkflowMetadata>)
    await expect(morningReportWorkflow(date, 'token2')).resolves.toBe('sent')
    expect(generateMorningReportCopy).toHaveBeenCalledTimes(1)
    expect(sendSimpleEmail).toHaveBeenCalledTimes(3)
    expect(vi.mocked(sendSimpleEmail).mock.calls[2][0]).toMatchObject({
      to: 'first@example.com',
      html: firstReport!.email!.html,
    })
  })

  it('records a removed admin as skipped when a failed report resumes', async () => {
    vi.mocked(sendSimpleEmail).mockRejectedValueOnce(
      Object.assign(new Error('Rejected'), { name: 'MessageRejected' })
    )
    await expect(morningReportWorkflow(date, 'token1')).rejects.toThrow(
      'failed recipients'
    )
    vi.stubEnv('ADMIN_EMAILS', 'second@example.com')
    await reserveMorningReport(date, 'token2', 'run1')
    vi.mocked(getWorkflowMetadata).mockReturnValue({
      workflowRunId: 'run2',
    } as ReturnType<typeof getWorkflowMetadata>)
    await expect(morningReportWorkflow(date, 'token2')).resolves.toBe('sent')
    expect(sendSimpleEmail).toHaveBeenCalledTimes(2)
    const rows = await db.select().from(morningReportDeliveries)
    expect(
      rows.find((row) => row.recipient === 'first@example.com')
    ).toMatchObject({
      sentAt: null,
      skippedAt: expect.any(Date),
      skipReason: 'admin_removed',
    })
    expect(
      rows.find((row) => row.recipient === 'second@example.com')
    ).toMatchObject({
      sentAt: expect.any(Date),
      skippedAt: null,
      skipReason: null,
    })
    expect((await getMorningReport(date))?.completedAt).toBeInstanceOf(Date)
  })

  it('fails visibly with no admins instead of recording success', async () => {
    vi.stubEnv('ADMIN_EMAILS', '')
    await expect(morningReportWorkflow(date, 'token1')).rejects.toThrow(
      'no admin recipients'
    )
    expect(sendSimpleEmail).not.toHaveBeenCalled()
    expect((await getMorningReport(date))?.completedAt).toBeNull()
  })
})
