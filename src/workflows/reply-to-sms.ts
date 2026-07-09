import { getStepMetadata, RetryableError } from 'workflow'
import {
  type BellSmsInput,
  generateBellSmsBody,
  recordBellSms,
  sendBellSmsBody,
} from '@/lib/phone/bell-sms'
import type { SentSms } from '@/lib/phone/twilio'
import { isRetryableTwilioError, TwilioApiError } from '@/lib/phone/twilio'

// Keep the workflow-scope fallback sandbox-safe. Importing the formatted
// constant from bell-sms would pull its filesystem-backed search tool graph
// into the workflow orchestrator instead of confining it to use-step code.
const FALLBACK_BELL_SMS_BODY =
  '[Bell AI] I could not answer that right now. Please try again.'

/** Generates the stable body once so delivery retries do not rewrite it. */
export async function generateBellSmsStep(
  input: BellSmsInput
): Promise<string> {
  'use step'
  console.log(
    `[replyToSms] generate START inboundMessageId=${input.inboundMessageId}`
  )
  const body = await generateBellSmsBody(input)
  console.log(
    `[replyToSms] generate DONE inboundMessageId=${input.inboundMessageId}`
  )
  return body
}

generateBellSmsStep.maxRetries = 2

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
  result: SentSms | null
): Promise<void> {
  'use step'
  console.log(
    `[replyToSms] record START inboundMessageId=${input.inboundMessageId}`
  )
  await recordBellSms(input, body, result)
  console.log(
    `[replyToSms] record DONE inboundMessageId=${input.inboundMessageId}`
  )
}

recordBellSmsStep.maxRetries = 5

/** Generates and sends one durable Bell reply for an inbound Twilio SMS. */
export async function replyToSmsWorkflow(input: BellSmsInput): Promise<void> {
  'use workflow'
  console.log(
    `[replyToSmsWorkflow] START inboundMessageId=${input.inboundMessageId}`
  )

  let body: string
  try {
    body = await generateBellSmsStep(input)
  } catch (err) {
    console.error(
      `[replyToSmsWorkflow] generation failed; using fallback inboundMessageId=${input.inboundMessageId}`,
      err
    )
    body = FALLBACK_BELL_SMS_BODY
  }

  let result: SentSms | null
  try {
    result = await sendBellSmsStep(input, body)
  } catch (err) {
    console.error(
      `[replyToSmsWorkflow] delivery failed; recording failure inboundMessageId=${input.inboundMessageId}`,
      err
    )
    result = null
  }
  await recordBellSmsStep(input, body, result)
  console.log(
    `[replyToSmsWorkflow] DONE inboundMessageId=${input.inboundMessageId}`
  )
}
