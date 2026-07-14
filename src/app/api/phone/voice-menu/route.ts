import { after, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { smsSignupUi } from '@/lib/flags'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { isE164, numberLabel, sitePhoneNumber } from '@/lib/phone/config'
import { sendSmsSignupNotification } from '@/lib/phone/notifications'
import {
  sayAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'
import { smsSignupOnboardingWorkflow } from '@/workflows/sms-signup-onboarding'

/**
 * Handles the DTMF choice from /api/phone/voice. 1 or timeout goes to voicemail;
 * 2 subscribes a caller ID to the all-newsletters SMS list.
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
    const lease = webhookEvent
      ? await claimPhoneWebhookEvent(webhookEvent.event.id)
      : null
    if (webhookEvent && !lease) {
      return twimlResponse(
        sayAndHangupTwiml(
          'This phone menu request was already handled. Goodbye.'
        )
      )
    }

    const confirmationFrom = sitePhoneNumber()
    try {
      await subscribeSmsNumber({
        phoneNumber: from,
        source: `call:${numberLabel(to).toLowerCase()}`,
      })
      if (confirmationFrom) {
        await start(smsSignupOnboardingWorkflow, [
          {
            from: confirmationFrom,
            to: from,
            sendConfirmation: true,
          },
        ])
      }
      if (webhookEvent && lease) {
        const marked = await markPhoneWebhookEventProcessed(
          webhookEvent.event.id,
          lease
        )
        if (!marked) {
          throw new Error(`Voice signup ${callSid} lost its processing lease`)
        }
      }
    } catch (err) {
      if (webhookEvent && lease) {
        await releasePhoneWebhookEvent(webhookEvent.event.id, lease)
      }
      throw err
    }
    after(async () => {
      const tasks: Promise<unknown>[] = []
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
      ...voicemailCallbackUrls({ from, to, metadata }),
    })
  )
}
