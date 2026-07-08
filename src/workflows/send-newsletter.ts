import { FatalError, getStepMetadata, RetryableError } from 'workflow'
import { getPostBySlugWithoutImages as getPostBySlug } from '@/lib/content/loader-without-images'
import {
  bulkCreateQueued,
  findSendableByIds,
  markPermanentFailure,
  markSent,
  pendingRowIdsBySlug,
} from '@/lib/db/queries/email-sends'
import {
  bulkCreateQueuedSms,
  type ClaimedSmsSend,
  claimSendableSmsById,
  findSentSmsByIds,
  markSmsPermanentFailure,
  markSmsSent,
  markUnsendableSmsSkippedById,
  pendingSmsRowIdsBySlug,
} from '@/lib/db/queries/sms-sends'
import { findEligibleSmsIds } from '@/lib/db/queries/sms-subscribers'
import { findEligibleIds, isNewsletter } from '@/lib/db/queries/subscribers'
import { isSuppressed } from '@/lib/db/queries/suppressions'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { isPermanentSesError } from '@/lib/email/errors'
import { sendQueuedEmail } from '@/lib/email/queued-send'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { phoneNumbers } from '@/lib/phone/config'
import { renderNewsletterSms } from '@/lib/phone/newsletter-sms'
import {
  isRetryableTwilioError,
  type SentSms,
  sendSms,
} from '@/lib/phone/twilio'

// ~12-13/sec, comfortably under SES's default 14/sec. Paced inside the step
// (steps have full Node.js access, so setTimeout is fine).
const BATCH_SIZE = 50
const SEND_SPACING_MS = 80
const SMS_SEND_SPACING_MS = 1000

function retryableStepError(err: unknown): RetryableError {
  const { attempt } = getStepMetadata()
  return new RetryableError(err instanceof Error ? err.message : String(err), {
    retryAfter: Math.min(60_000, 2 ** attempt * 1000),
  })
}

function chunk(ids: number[]): number[][] {
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE))
  }
  return chunks
}

/**
 * Enqueues newly-eligible recipients for the post, then returns ALL currently
 * pending row ids (newly enqueued + any left over from a prior run) chunked for
 * sending. Because eligibility excludes already-sent/pending rows, re-running is
 * idempotent and resumes a stalled send rather than duplicating it.
 *
 * Exported (like sendBatch) so the integration tests can invoke the step
 * directly; without the workflow compiler a 'use step' function is a plain
 * async function.
 */
export async function enqueueRecipients(slug: string): Promise<number[][]> {
  'use step'
  const post = getPostBySlug(slug)
  if (!post) {
    throw new FatalError(`Post not found: ${slug}`)
  }
  if (!isNewsletter(post.newsletter)) {
    throw new FatalError(`Post is not a newsletter: ${slug}`)
  }

  const eligibleIds = await findEligibleIds(post.newsletter, slug)
  if (eligibleIds.length > 0) {
    const body = await buildEmailBodyHtml(post)
    await bulkCreateQueued({
      subscriberIds: eligibleIds,
      postSlug: slug,
      newsletter: post.newsletter,
      subject: body.subject,
      htmlContent: body.html,
      textContent: body.bodyText,
      previewText: body.previewText,
    })
  }

  return chunk(await pendingRowIdsBySlug(slug))
}

/**
 * Sends one batch of rows. Idempotent at the DB level: re-reads which rows are
 * still pending, so a retry after a mid-batch transient failure never re-sends a
 * row already marked sent. Per-recipient permanent failures are recorded and
 * skipped; a transient SES error triggers a backed-off retry of the (now-smaller)
 * batch via RetryableError.
 *
 * Delivery is at-least-once, not exactly-once: if SES accepts a message but its
 * HTTP response is lost, the row stays sendable and the recipient can receive a
 * duplicate on retry (SESv2 SendEmail exposes no idempotency key). Acceptable for
 * a newsletter.
 */
export async function sendBatch(rowIds: number[]): Promise<{
  sent: number
  failed: number
}> {
  'use step'
  const rows = await findSendableByIds(rowIds)
  let sent = 0
  let failed = 0

  for (const { send, email } of rows) {
    if (await isSuppressed(email)) {
      await markPermanentFailure(send.id, 'Recipient is suppressed')
      failed++
      continue
    }

    try {
      await sendQueuedEmail({
        email,
        subject: send.subject,
        htmlContent: send.htmlContent,
        textContent: send.textContent,
        newsletter: send.newsletter,
        previewText: send.previewText,
        unsubscribeToken: send.unsubscribeToken,
      })
      await markSent(send.id)
      sent++
    } catch (err) {
      if (isPermanentSesError(err)) {
        await markPermanentFailure(
          send.id,
          err instanceof Error ? err.message : String(err)
        )
        failed++
      } else {
        // Transient SES error (most likely throttling near the send-rate ceiling).
        // Back off and let the runtime retry the batch — re-reading sendable rows
        // means already-sent recipients are skipped — so a sustained throttle clears
        // instead of failing the run and stranding the remaining batches.
        const { attempt } = getStepMetadata()
        throw new RetryableError(
          err instanceof Error ? err.message : String(err),
          { retryAfter: Math.min(60_000, 2 ** attempt * 1000) }
        )
      }
    }

    await new Promise((resolve) => setTimeout(resolve, SEND_SPACING_MS))
  }

  return { sent, failed }
}

// Give a sustained SES throttle room to clear (7 attempts, exponential backoff)
// before the run fails; the batch is idempotent so extra attempts can't double-send.
sendBatch.maxRetries = 6

export async function enqueueSmsRecipients(slug: string): Promise<number[][]> {
  'use step'
  const post = getPostBySlug(slug)
  if (!post) {
    throw new FatalError(`Post not found: ${slug}`)
  }
  if (!isNewsletter(post.newsletter)) {
    throw new FatalError(`Post is not a newsletter: ${slug}`)
  }

  const eligibleIds = await findEligibleSmsIds(post.newsletter, slug)
  if (eligibleIds.length > 0) {
    await bulkCreateQueuedSms({
      smsSubscriberIds: eligibleIds,
      postSlug: slug,
      newsletter: post.newsletter,
      body: renderNewsletterSms(post),
    })
  }

  return chunk(await pendingSmsRowIdsBySlug(slug))
}

async function recordSmsTextHistory(
  row: ClaimedSmsSend,
  result?: SentSms
): Promise<void> {
  const twilioSid = result?.sid ?? row.send.twilioSid
  if (!twilioSid) {
    throw new Error(`SMS send ${row.send.id} has no Twilio sid`)
  }
  await createTextMessage({
    fromNumber: phoneNumbers.NYC,
    toNumber: row.phoneNumber,
    body: row.send.body,
    direction: 'outbound',
    twilioSid,
    status: result?.status ?? row.send.twilioStatus ?? 'queued',
  })
}

export async function sendSmsBatch(rowIds: number[]): Promise<{
  sent: number
  failed: number
}> {
  'use step'
  let sent = 0
  let failed = 0

  for (const rowId of rowIds) {
    const recovered = await findSentSmsByIds([rowId])
    if (recovered[0]) {
      try {
        await recordSmsTextHistory(recovered[0])
        sent++
      } catch (err) {
        throw retryableStepError(err)
      }
      await new Promise((resolve) => setTimeout(resolve, SMS_SEND_SPACING_MS))
      continue
    }

    const row = await claimSendableSmsById(rowId)
    if (!row) {
      await markUnsendableSmsSkippedById(rowId)
      continue
    }

    const { send, phoneNumber } = row
    let result: SentSms
    try {
      result = await sendSms({
        from: phoneNumbers.NYC,
        to: phoneNumber,
        body: send.body,
      })
    } catch (err) {
      if (isRetryableTwilioError(err)) throw retryableStepError(err)
      await markSmsPermanentFailure(
        send.id,
        err instanceof Error ? err.message : String(err)
      )
      failed++
      await new Promise((resolve) => setTimeout(resolve, SMS_SEND_SPACING_MS))
      continue
    }

    try {
      const markedSent = await markSmsSent({
        id: send.id,
        twilioSid: result.sid,
        twilioStatus: result.status,
      })
      if (!markedSent) continue
      await recordSmsTextHistory(row, result)
      sent++
    } catch (err) {
      throw retryableStepError(err)
    }

    await new Promise((resolve) => setTimeout(resolve, SMS_SEND_SPACING_MS))
  }

  return { sent, failed }
}

sendSmsBatch.maxRetries = 6

/**
 * Durable newsletter send. Enqueues eligible recipients and sends them in paced,
 * retryable batches. Survives function timeouts/crashes via the Workflow runtime.
 */
export async function sendNewsletterWorkflow(slug: string): Promise<{
  batches: number
  sent: number
  failed: number
  smsBatches: number
  smsSent: number
  smsFailed: number
}> {
  'use workflow'
  const chunks = await enqueueRecipients(slug)
  let sent = 0
  let failed = 0
  for (const batch of chunks) {
    const result = await sendBatch(batch)
    sent += result.sent
    failed += result.failed
  }

  const smsChunks = await enqueueSmsRecipients(slug)
  let smsSent = 0
  let smsFailed = 0
  for (const batch of smsChunks) {
    const result = await sendSmsBatch(batch)
    smsSent += result.sent
    smsFailed += result.failed
  }

  return {
    batches: chunks.length,
    sent,
    failed,
    smsBatches: smsChunks.length,
    smsSent,
    smsFailed,
  }
}
