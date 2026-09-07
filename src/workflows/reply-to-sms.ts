import { getStepMetadata, getWorkflowMetadata, RetryableError } from 'workflow'
import { setBellGenerationWorkflowRunId } from '@/lib/db/queries/bell-generations'
import { markPhoneWebhookEventProcessed } from '@/lib/db/queries/phone-webhook-events'
import { findTextMessageById } from '@/lib/db/queries/text-messages'
import {
  type BellSmsGenerationResult,
  type BellSmsInput,
  generateBellSmsBody,
  recordBellSms,
  sendBellSmsBody,
} from '@/lib/phone/bell-sms'
import { fixedBellSmsBody } from '@/lib/phone/bell-sms-copy'
import { sendIncomingSmsNotification } from '@/lib/phone/notifications'
import type { SentSms } from '@/lib/phone/twilio'
import { isRetryableTwilioError, TwilioApiError } from '@/lib/phone/twilio'

// Keep the workflow-scope fallback sandbox-safe. Importing the formatted
// constant from bell-sms would pull its filesystem-backed search tool graph
// into the workflow orchestrator instead of confining it to use-step code.
const FALLBACK_BELL_SMS_BODY = fixedBellSmsBody(
  'I could not answer that right now. Please try again.'
)

/** Only the durable owner of the webhook may generate or send a reply. */
export async function acceptBellSmsWebhookStep(
  input: BellSmsInput,
  workflowRunId: string
): Promise<boolean> {
  'use step'
  if (!(await findTextMessageById(input.inboundMessageId))) return false
  // Older queued inputs predate the lease handoff. New routes always supply
  // both fields; reject partial/invalid claims instead of authorizing them.
  if (input.webhookEventId !== undefined || input.webhookLease !== undefined) {
    if (input.webhookEventId === undefined || !input.webhookLease) return false
    const lease = new Date(input.webhookLease)
    if (Number.isNaN(lease.getTime())) return false
    const accepted = await markPhoneWebhookEventProcessed(
      input.webhookEventId,
      lease,
      getStepMetadata().stepId
    )
    if (!accepted) return false
  }
  // A lost acknowledgement retries this same step ID, which can recover the
  // consumed lease without letting another workflow become a second winner.
  await setBellGenerationWorkflowRunId(input.generationId, workflowRunId)
  return true
}

acceptBellSmsWebhookStep.maxRetries = 5

/** Generates the stable body once so delivery retries do not rewrite it. */
export async function generateBellSmsStep(
  input: BellSmsInput
): Promise<BellSmsGenerationResult> {
  'use step'
  console.log(
    `[replyToSms] generate START inboundMessageId=${input.inboundMessageId}`
  )
  let body: BellSmsGenerationResult
  try {
    body = await generateBellSmsBody(input)
  } catch (error) {
    const { attempt } = getStepMetadata()
    // SDK retries repair individual requests. A durable retry also recovers
    // whole-loop timeouts and temporary database outages without rapid loops.
    throw new RetryableError(
      error instanceof Error ? error.message : String(error),
      { retryAfter: Math.min(120_000, 2 ** attempt * 5_000) }
    )
  }
  console.log(
    `[replyToSms] generate DONE inboundMessageId=${input.inboundMessageId}`
  )
  return body
}

generateBellSmsStep.maxRetries = 3

/** Delivers the generated body; the durable result is recorded separately. */
export async function sendBellSmsStep(
  input: BellSmsInput,
  body: string
): Promise<SentSms | null> {
  'use step'
  console.log(
    `[replyToSms] send START inboundMessageId=${input.inboundMessageId}`
  )
  try {
    const result = await sendBellSmsBody(input, body)
    console.log(
      `[replyToSms] send DONE inboundMessageId=${input.inboundMessageId}`
    )
    return result
  } catch (err) {
    if (!isRetryableTwilioError(err)) {
      console.error(
        `[replyToSms] send PERMANENT_FAILURE inboundMessageId=${input.inboundMessageId}`,
        err instanceof TwilioApiError ? err.message : err
      )
      return null
    }

    const { attempt } = getStepMetadata()
    throw new RetryableError(err instanceof Error ? err.message : String(err), {
      retryAfter: Math.min(60_000, 2 ** attempt * 1000),
    })
  }
}

sendBellSmsStep.maxRetries = 5

/** Persists accepted or permanently failed delivery without re-sending. */
export async function recordBellSmsStep(
  input: BellSmsInput,
  body: string,
  result: SentSms | null,
  assistantMessageId?: string | null
): Promise<{ body: string; status: string } | null> {
  'use step'
  console.log(
    `[replyToSms] record START inboundMessageId=${input.inboundMessageId}`
  )
  const recorded = await recordBellSms(input, body, result, assistantMessageId)
  console.log(
    `[replyToSms] record DONE inboundMessageId=${input.inboundMessageId}`
  )
  return recorded ? { body: recorded.body, status: recorded.status } : null
}

recordBellSmsStep.maxRetries = 5

/** Emails the canonical inbound message and recorded Bell reply to admins. */
export async function sendIncomingSmsNotificationStep(
  input: BellSmsInput,
  bellReply: { body: string; status: string }
): Promise<'sent' | 'skipped'> {
  'use step'
  console.log(
    `[replyToSms] notify START inboundMessageId=${input.inboundMessageId}`
  )
  const inbound = await findTextMessageById(input.inboundMessageId)
  if (!inbound) {
    console.log(
      `[replyToSms] notify SKIPPED inboundMessageId=${input.inboundMessageId}`
    )
    return 'skipped'
  }
  await sendIncomingSmsNotification({
    from: inbound.fromNumber,
    to: inbound.toNumber,
    body: inbound.body,
    bellResponse: bellReply.body,
    bellReplyFailed: bellReply.status === 'failed',
    receivedAt: inbound.createdAt,
  })
  console.log(
    `[replyToSms] notify DONE inboundMessageId=${input.inboundMessageId}`
  )
  return 'sent'
}

// SES has no idempotency key, so a lost acknowledgement can duplicate this
// email. Keeping it separate ensures an email retry can never resend the SMS.
sendIncomingSmsNotificationStep.maxRetries = 5

/** Generates and sends one durable Bell reply for an inbound Twilio SMS. */
export async function replyToSmsWorkflow(input: BellSmsInput): Promise<void> {
  'use workflow'
  console.log(
    `[replyToSmsWorkflow] START inboundMessageId=${input.inboundMessageId}`
  )
  if (
    !(await acceptBellSmsWebhookStep(
      input,
      getWorkflowMetadata().workflowRunId
    ))
  ) {
    return
  }

  let generated: BellSmsGenerationResult
  try {
    generated = await generateBellSmsStep(input)
  } catch (err) {
    console.error(
      `[replyToSmsWorkflow] generation failed; using fallback inboundMessageId=${input.inboundMessageId}`,
      err
    )
    generated = {
      body: FALLBACK_BELL_SMS_BODY,
      assistantMessageId: '',
    }
  }

  let result: SentSms | null
  try {
    result = await sendBellSmsStep(input, generated.body)
  } catch (err) {
    console.error(
      `[replyToSmsWorkflow] delivery failed; recording failure inboundMessageId=${input.inboundMessageId}`,
      err
    )
    result = null
  }
  const recorded = await recordBellSmsStep(
    input,
    generated.body,
    result,
    generated.assistantMessageId || null
  )
  if (recorded) {
    try {
      await sendIncomingSmsNotificationStep(input, recorded)
    } catch (err) {
      console.error(
        `[replyToSmsWorkflow] notification failed inboundMessageId=${input.inboundMessageId}`,
        err
      )
    }
  }
  console.log(
    `[replyToSmsWorkflow] DONE inboundMessageId=${input.inboundMessageId}`
  )
}
