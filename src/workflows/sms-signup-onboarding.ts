import { getStepMetadata, RetryableError, sleep } from 'workflow'
import { findSmsSubscriberByPhoneNumber } from '@/lib/db/queries/sms-subscribers'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { sendBellContactOnboarding } from '@/lib/phone/bell-contact-onboarding'
import {
  SMS_BELL_CONTACT_FALLBACK,
  SMS_SUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'
import {
  isRetryableTwilioError,
  sendSms,
  TwilioApiError,
} from '@/lib/phone/twilio'

const WELCOME_MESSAGE_DELAY = '3s'

export type SmsSignupOnboardingInput = {
  from: string
  to: string
  sendConfirmation: boolean
}

async function recordFailedMessage(
  input: SmsSignupOnboardingInput,
  body: string
): Promise<void> {
  await createTextMessage({
    fromNumber: input.from,
    toNumber: input.to,
    body,
    direction: 'outbound',
    twilioSid: null,
    status: 'failed',
  })
}

async function sendTrackedSms(
  input: SmsSignupOnboardingInput,
  body: string,
  label: string
): Promise<boolean> {
  try {
    const result = await sendSms({
      from: input.from,
      to: input.to,
      body,
    })
    await createTextMessage({
      fromNumber: input.from,
      toNumber: input.to,
      body,
      direction: 'outbound',
      twilioSid: result.sid,
      status: result.status,
    })
    return true
  } catch (err) {
    if (isRetryableTwilioError(err)) {
      const { attempt } = getStepMetadata()
      throw new RetryableError(
        err instanceof Error ? err.message : String(err),
        { retryAfter: Math.min(60_000, 2 ** attempt * 1000) }
      )
    }

    console.error(
      `[smsSignupOnboarding] ${label} PERMANENT_FAILURE`,
      err instanceof TwilioApiError ? err.message : err
    )
    await recordFailedMessage(input, body)
    return false
  }
}

export async function sendSignupConfirmationStep(
  input: SmsSignupOnboardingInput
): Promise<boolean> {
  'use step'
  console.log('[smsSignupOnboarding] confirmation START')
  const sent = await sendTrackedSms(
    input,
    SMS_SUBSCRIBE_CONFIRMATION,
    'confirmation'
  )
  console.log(`[smsSignupOnboarding] confirmation ${sent ? 'DONE' : 'FAILED'}`)
  return sent
}

sendSignupConfirmationStep.maxRetries = 5

export async function sendBellContactOnboardingStep(
  input: SmsSignupOnboardingInput
): Promise<'sent' | 'skipped' | 'failed'> {
  'use step'
  console.log('[smsSignupOnboarding] Bell card START')
  try {
    const result = await sendBellContactOnboarding(input)
    console.log(`[smsSignupOnboarding] Bell card ${result.toUpperCase()}`)
    return result
  } catch (err) {
    if (isRetryableTwilioError(err)) {
      const { attempt } = getStepMetadata()
      throw new RetryableError(
        err instanceof Error ? err.message : String(err),
        { retryAfter: Math.min(60_000, 2 ** attempt * 1000) }
      )
    }
    console.error(
      '[smsSignupOnboarding] Bell card PERMANENT_FAILURE',
      err instanceof TwilioApiError ? err.message : err
    )
    return 'failed'
  }
}

sendBellContactOnboardingStep.maxRetries = 5

export async function sendBellContactFallbackStep(
  input: SmsSignupOnboardingInput
): Promise<boolean> {
  'use step'
  console.log('[smsSignupOnboarding] Bell fallback START')
  const subscriber = await findSmsSubscriberByPhoneNumber(input.to)
  if (!subscriber?.confirmedAt) {
    console.log('[smsSignupOnboarding] Bell fallback SKIPPED')
    return false
  }
  const sent = await sendTrackedSms(
    input,
    SMS_BELL_CONTACT_FALLBACK,
    'Bell fallback'
  )
  console.log(`[smsSignupOnboarding] Bell fallback ${sent ? 'DONE' : 'FAILED'}`)
  return sent
}

sendBellContactFallbackStep.maxRetries = 5

/** Sends the compliance confirmation, pauses, then introduces Bell by MMS. */
export async function smsSignupOnboardingWorkflow(
  input: SmsSignupOnboardingInput
): Promise<void> {
  'use workflow'
  console.log('[smsSignupOnboardingWorkflow] START')

  if (input.sendConfirmation) {
    let confirmationSent = false
    try {
      confirmationSent = await sendSignupConfirmationStep(input)
    } catch (err) {
      console.error('[smsSignupOnboardingWorkflow] confirmation failed', err)
    }
    if (!confirmationSent) return
  }

  await sleep(WELCOME_MESSAGE_DELAY)

  let contactResult: 'sent' | 'skipped' | 'failed' = 'failed'
  try {
    contactResult = await sendBellContactOnboardingStep(input)
  } catch (err) {
    console.error('[smsSignupOnboardingWorkflow] Bell card failed', err)
  }
  if (contactResult === 'failed') {
    try {
      await sendBellContactFallbackStep(input)
    } catch (err) {
      console.error('[smsSignupOnboardingWorkflow] Bell fallback failed', err)
    }
  }
  console.log('[smsSignupOnboardingWorkflow] DONE')
}
