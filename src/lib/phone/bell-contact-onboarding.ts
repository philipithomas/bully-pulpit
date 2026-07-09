import { siteConfig } from '@/lib/config'
import {
  claimBellContactCard,
  completeBellContactCard,
  releaseBellContactCard,
} from '@/lib/db/queries/sms-subscribers'
import {
  createTextMessage,
  updateTextMessageDelivery,
} from '@/lib/db/queries/text-messages'
import { SMS_BELL_CONTACT_ONBOARDING } from '@/lib/phone/sms-subscription-copy'
import { sendSms } from '@/lib/phone/twilio'

export type BellContactOnboardingResult = 'sent' | 'skipped'

/**
 * Sends the one-time Bell contact card for the current subscription activation.
 * The database lease keeps concurrent text and voice signups from duplicating
 * the MMS. Twilio has no idempotency key, so provider acceptance remains the
 * only unavoidable crash window.
 */
export async function sendBellContactOnboarding(input: {
  from: string
  to: string
}): Promise<BellContactOnboardingResult> {
  const processingAt = await claimBellContactCard(input.to)
  if (!processingAt) return 'skipped'

  let attemptId: number
  try {
    const attempt = await createTextMessage({
      fromNumber: input.from,
      toNumber: input.to,
      body: SMS_BELL_CONTACT_ONBOARDING,
      direction: 'outbound',
      twilioSid: null,
      status: 'sending',
    })
    attemptId = attempt.id
  } catch (err) {
    await releaseBellContactCard(input.to, processingAt)
    throw err
  }

  let result: Awaited<ReturnType<typeof sendSms>>
  try {
    result = await sendSms({
      from: input.from,
      to: input.to,
      body: SMS_BELL_CONTACT_ONBOARDING,
      mediaUrl: `${siteConfig.url}/bell.vcf`,
    })
  } catch (err) {
    await updateTextMessageDelivery(attemptId, { status: 'failed' }).catch(
      (recordErr) => {
        console.error(
          '[phone] Failed to record Bell contact-card MMS failure:',
          recordErr
        )
      }
    )
    await releaseBellContactCard(input.to, processingAt)
    throw err
  }

  const completed = await completeBellContactCard(input.to, processingAt)
  await updateTextMessageDelivery(attemptId, {
    twilioSid: result.sid,
    status: result.status,
  })
  if (!completed) {
    throw new Error(`Bell contact-card claim for ${input.to} was lost`)
  }
  return 'sent'
}
