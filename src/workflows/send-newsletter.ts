import { FatalError, getStepMetadata, RetryableError } from 'workflow'
import { getPostBySlug } from '@/lib/content/loader'
import {
  bulkCreateQueued,
  findSendableByIds,
  markPermanentFailure,
  markSent,
  pendingRowIdsBySlug,
} from '@/lib/db/queries/email-sends'
import { findEligibleIds, isNewsletter } from '@/lib/db/queries/subscribers'
import { isSuppressed } from '@/lib/db/queries/suppressions'
import { isPermanentSesError } from '@/lib/email/errors'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendQueuedEmail } from '@/lib/email/send'

// ~12-13/sec, comfortably under SES's default 14/sec. Paced inside the step
// (steps have full Node.js access, so setTimeout is fine).
const BATCH_SIZE = 50
const SEND_SPACING_MS = 80

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

/**
 * Durable newsletter send. Enqueues eligible recipients and sends them in paced,
 * retryable batches. Survives function timeouts/crashes via the Workflow runtime.
 */
export async function sendNewsletterWorkflow(slug: string): Promise<{
  batches: number
  sent: number
  failed: number
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
  return { batches: chunks.length, sent, failed }
}
