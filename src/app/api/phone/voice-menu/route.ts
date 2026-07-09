import { after, NextResponse } from 'next/server'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
} from '@/lib/db/queries/phone-webhook-events'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { smsSignupUi } from '@/lib/flags'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { sendBellContactOnboarding } from '@/lib/phone/bell-contact-onboarding'
import { isE164, numberLabel, sitePhoneNumber } from '@/lib/phone/config'
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

async function sendVoiceSignupMessage(input: {
  from: string
  to: string
  body: string
  label: string
}): Promise<boolean> {
  if (!isE164(input.from)) return false

  try {
    const result = await sendSms({
      from: input.from,
      to: input.to,
      body: input.body,
    })
    await createTextMessage({
      fromNumber: input.from,
      toNumber: input.to,
      body: input.body,
      direction: 'outbound',
      twilioSid: result.sid,
      status: result.status,
    })
    return true
  } catch (err) {
    console.error(`[phone/voice-menu] ${input.label} failed:`, err)
    try {
      await createTextMessage({
        fromNumber: input.from,
        toNumber: input.to,
        body: input.body,
        direction: 'outbound',
        twilioSid: null,
        status: 'failed',
      })
    } catch (recordErr) {
      console.error(
        `[phone/voice-menu] Failed to record ${input.label.toLowerCase()} attempt:`,
        recordErr
      )
    }
    return false
  }
}

/**
 * Handles the DTMF choice from /api/phone/voice. 1 or timeout goes to voicemail;
 * 2 subscribes a new caller ID to the all-newsletters SMS list. A caller that
 * previously sent STOP must reactivate from the handset before Twilio can send.
 */
export async function POST(request: Request) {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const digits = String(form.get('Digits') ?? '')
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const callSid = form.get('CallSid') ? String(form.get('CallSid')) : ''
  const metadata = twilioWebhookMetadataFromForm(form, from)

  if ((await smsSignupUi()) && digits === '2') {
    if (!isE164(from)) {
      return twimlResponse(
        sayAndHangupTwiml(
          'We could not subscribe this caller ID. Please text SUBSCRIBE to the number you called.'
        )
      )
    }

    const webhookEvent = callSid
      ? await findOrCreatePhoneWebhookEvent({
          eventKey: `voice-menu:${callSid}:2`,
          eventType: 'voice-menu',
        })
      : null
    if (webhookEvent?.event.processedAt) {
      return twimlResponse(
        sayAndHangupTwiml(
          'This phone menu request was already handled. Goodbye.'
        )
      )
    }

    const existing = await findSmsSubscriberByPhoneNumber(from)
    if (existing && !existing.confirmedAt) {
      if (webhookEvent) {
        const lease = await claimPhoneWebhookEvent(webhookEvent.event.id)
        const marked = lease
          ? await markPhoneWebhookEventProcessed(webhookEvent.event.id, lease)
          : false
        if (!marked) {
          return twimlResponse(
            sayAndHangupTwiml(
              'This phone menu request was already handled. Goodbye.'
            )
          )
        }
      }
      return twimlResponse(
        sayAndHangupTwiml(
          'To resubscribe to new-post texts, send START or UNSTOP from this phone to the number you called. Goodbye.'
        )
      )
    }

    const confirmationFrom = sitePhoneNumber()
    await subscribeSmsNumber({
      phoneNumber: from,
      source: `call:${numberLabel(to).toLowerCase()}`,
      processedPhoneWebhookEventId: webhookEvent?.event.id,
    })
    after(async () => {
      const tasks: Promise<unknown>[] = []
      if (confirmationFrom) {
        tasks.push(
          (async () => {
            const confirmationSent = await sendVoiceSignupMessage({
              from: confirmationFrom,
              to: from,
              body: SMS_SUBSCRIBE_CONFIRMATION,
              label: 'Confirmation SMS',
            })
            if (confirmationSent) {
              await sendBellContactOnboarding({
                from: confirmationFrom,
                to: from,
              }).catch((err) => {
                console.error(
                  '[phone/voice-menu] Bell contact-card MMS failed:',
                  err
                )
              })
            }
          })()
        )
      }
      if (!existing?.confirmedAt) {
        tasks.push(
          sendSmsSignupNotification({
            phoneNumber: from,
            to,
            source: 'voice-menu',
            metadata,
          }).catch((err) => {
            console.error(
              '[phone/voice-menu] SMS signup notification failed:',
              err
            )
          })
        )
      }
      await Promise.all(tasks)
    })
    return twimlResponse(
      sayAndHangupTwiml(
        'You are subscribed to new-post texts from philipithomas.com. Text STOP to unsubscribe or HELP for help. Goodbye.'
      )
    )
  }

  return twimlResponse(
    voicemailTwiml({
      greeting: 'Leave a message after the tone.',
      ...voicemailCallbackUrls({ from, to, metadata }),
    })
  )
}
