import {
  FatalError,
  getStepMetadata,
  getWorkflowMetadata,
  RetryableError,
} from 'workflow'
import { siteConfig } from '@/lib/config'
import {
  recordCronFailed,
  recordCronStarted,
  recordCronSucceeded,
} from '@/lib/cron/heartbeat'
import {
  acceptMorningReport,
  completeMorningReport,
  getMorningReport,
  markMorningReportDelivered,
  morningReportDeliveryPending,
  saveMorningReportEmail,
  skipMorningReportDelivery,
  snapshotMorningReport,
} from '@/lib/db/queries/morning-reports'
import { isPermanentSesError } from '@/lib/email/errors'
import { sendSimpleEmail } from '@/lib/email/ses'
import {
  buildMorningReportContent,
  fallbackMorningReportCopy,
  type MorningReportContent,
  type MorningReportEmail,
} from '@/lib/morning-report/content'
import { generateMorningReportCopy } from '@/lib/morning-report/copy'
import { renderMorningReport } from '@/lib/morning-report/render'

async function acceptReport(
  date: string,
  token: string
): Promise<string | null> {
  'use step'
  if (process.env.VERCEL_ENV !== 'production')
    throw new FatalError('Morning reports require production')
  const { workflowRunId } = getWorkflowMetadata()
  if (!(await acceptMorningReport(date, token, workflowRunId))) return null
  await recordCronStarted('morning-report')
  return workflowRunId
}
acceptReport.maxRetries = 5

async function prepareReport(date: string, runId: string) {
  'use step'
  const existing = await getMorningReport(date)
  const recipients = existing?.recipients ?? [
    ...new Set(siteConfig.adminEmails),
  ]
  if (!recipients.length)
    throw new FatalError('Morning report has no admin recipients')
  return snapshotMorningReport(
    date,
    runId,
    existing?.content ?? buildMorningReportContent(date),
    recipients
  )
}
prepareReport.maxRetries = 3

async function composeReport(content: MorningReportContent) {
  'use step'
  try {
    return await generateMorningReportCopy(content)
  } catch {
    throw new RetryableError('Morning report copy generation failed', {
      retryAfter: 15_000 * 2 ** (getStepMetadata().attempt - 1),
    })
  }
}
composeReport.maxRetries = 2

type GeneratedCopy = Awaited<ReturnType<typeof generateMorningReportCopy>>

async function persistReport(
  date: string,
  runId: string,
  content: MorningReportContent,
  generated: GeneratedCopy | null
) {
  'use step'
  const copy = generated?.copy ?? fallbackMorningReportCopy(content)
  return saveMorningReportEmail(date, runId, {
    ...copy,
    ...renderMorningReport(content, copy),
    model: generated?.model ?? null,
    generationId: generated?.generationId ?? null,
  })
}
persistReport.maxRetries = 5

async function sendReport(
  date: string,
  runId: string,
  recipient: string,
  email: MorningReportEmail
) {
  'use step'
  if (process.env.VERCEL_ENV !== 'production')
    throw new FatalError('Morning reports require production')
  if (!siteConfig.adminEmails.includes(recipient)) {
    await skipMorningReportDelivery(date, runId, recipient)
    return false
  }
  if (!(await morningReportDeliveryPending(date, runId, recipient)))
    return false
  try {
    await sendSimpleEmail({
      to: recipient,
      subject: email.subject,
      html: email.html,
      text: email.text,
      abortSignal: AbortSignal.timeout(30_000),
    })
    return true
  } catch (error) {
    if (isPermanentSesError(error))
      throw new FatalError('Morning report email rejected')
    throw new RetryableError('Morning report delivery failed', {
      retryAfter: 30_000 * 2 ** (getStepMetadata().attempt - 1),
    })
  }
}
sendReport.maxRetries = 3

async function recordDelivery(date: string, runId: string, recipient: string) {
  'use step'
  await markMorningReportDelivered(date, runId, recipient)
}
recordDelivery.maxRetries = 5

async function finishReport(date: string, runId: string) {
  'use step'
  await completeMorningReport(date, runId)
  await recordCronSucceeded('morning-report')
}
finishReport.maxRetries = 5

async function failReport() {
  'use step'
  await recordCronFailed('morning-report')
}

/** SES has no idempotency key: acceptance followed by a lost Workflow checkpoint
 * or exhausted completion-recording retries can still duplicate mail. One live owner and durable per-recipient completion
 * prevent cron races and preserve partial progress on subsequent catch-up runs. */
export async function morningReportWorkflow(date: string, token: string) {
  'use workflow'
  const runId = await acceptReport(date, token)
  if (!runId) return 'duplicate'
  try {
    const snapshot = await prepareReport(date, runId)
    let email = snapshot.email
    if (!email) {
      let generated: GeneratedCopy | null = null
      try {
        generated = await composeReport(snapshot.content)
      } catch {
        // Preserve every factual section even when the creative copy provider
        // exhausts its retries. Rendering/fallback remain inside a durable step.
      }
      email = await persistReport(date, runId, snapshot.content, generated)
    }
    let deliveryFailed = false
    for (const recipient of snapshot.recipients) {
      try {
        if (await sendReport(date, runId, recipient, email))
          await recordDelivery(date, runId, recipient)
      } catch {
        deliveryFailed = true
      }
    }
    if (deliveryFailed) throw new Error('Morning report has failed recipients')
    await finishReport(date, runId)
    return 'sent'
  } catch (error) {
    await failReport()
    throw error
  }
}
