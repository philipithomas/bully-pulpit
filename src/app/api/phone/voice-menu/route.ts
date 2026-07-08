import { after, NextResponse } from 'next/server'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { isSmsSignupUiEnabled } from '@/lib/feature-flags'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { isE164, numberLabel } from '@/lib/phone/config'
import { sendSmsSignupNotification } from '@/lib/phone/notifications'
import { SMS_SUBSCRIBE_CONFIRMATION } from '@/lib/phone/sms-subscription-copy'
import { sendSms } from '@/lib/phone/twilio'
import {
  sayAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

async function sendVoiceSignupConfirmationSms(input: {
  from: string
  to: string
}): Promise<boolean> {
  if (!isE164(input.from)) return false

  try {
    const result = await sendSms({
      from: input.from,
      to: input.to,
      body: SMS_SUBSCRIBE_CONFIRMATION,
    })
    await createTextMessage({
      fromNumber: input.from,
      toNumber: input.to,
      body: SMS_SUBSCRIBE_CONFIRMATION,
      direction: 'outbound',
      twilioSid: result.sid,
      status: result.status,
    })
    return true
  } catch (err) {
    console.error('[phone/voice-menu] Confirmation SMS failed:', err)
    try {
      await createTextMessage({
        fromNumber: input.from,
        toNumber: input.to,
        body: SMS_SUBSCRIBE_CONFIRMATION,
        direction: 'outbound',
        twilioSid: null,
        status: 'failed',
      })
    } catch (recordErr) {
      console.error(
        '[phone/voice-menu] Failed to record confirmation SMS attempt:',
        recordErr
      )
    }
    return false
  }
}

/**
 * Handles the DTMF choice from /api/phone/voice. 1 or timeout goes to voicemail;
 * 2 subscribes the caller ID to the all-newsletters SMS list.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const digits = String(form.get('Digits') ?? '')
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = twilioWebhookMetadataFromForm(form, from)

  if (isSmsSignupUiEnabled() && digits === '2') {
    if (!isE164(from)) {
      return twimlResponse(
        sayAndHangupTwiml(
          'We could not subscribe this caller ID. Please text SUBSCRIBE to the number you called.'
        )
      )
    }

    const existing = await findSmsSubscriberByPhoneNumber(from)
    await subscribeSmsNumber({
      phoneNumber: from,
      source: `call:${numberLabel(to).toLowerCase()}`,
    })
    const confirmationSent = await sendVoiceSignupConfirmationSms({
      from: to,
      to: from,
    })
    if (!existing?.confirmedAt) {
      after(async () => {
        try {
          await sendSmsSignupNotification({
            phoneNumber: from,
            to,
            source: 'voice-menu',
            metadata,
          })
        } catch (err) {
          console.error(
            '[phone/voice-menu] SMS signup notification failed:',
            err
          )
        }
      })
    }
    return twimlResponse(
      sayAndHangupTwiml(
        confirmationSent
          ? 'You are subscribed to text message updates from philipithomas.com. I sent a confirmation text. Reply STOP to that text at any time to unsubscribe. Goodbye.'
          : 'You are subscribed to text message updates from philipithomas.com. Text STOP at any time to unsubscribe. Goodbye.'
      )
    )
  }

  return twimlResponse(
    voicemailTwiml({
      greeting: 'Leave a message after the tone.',
      ...voicemailCallbackUrls({ from, to }),
    })
  )
}
