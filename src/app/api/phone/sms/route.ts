import { trace } from '@opentelemetry/api'
import { after, NextResponse } from 'next/server'
import { start } from 'workflow/api'
import { smsIdentityHash } from '@/lib/chat/bell-identity'
import {
  createSmsBellTurn,
  getOrCreateSmsBellConversation,
} from '@/lib/db/queries/bell-conversations'
import { setBellGenerationWorkflowRunId } from '@/lib/db/queries/bell-generations'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
  unsubscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import {
  createTextMessage,
  createTextMessageWithStatus,
} from '@/lib/db/queries/text-messages'
import { isAuthorizedPhoneWebhook } from '@/lib/phone/auth'
import { numberLabel } from '@/lib/phone/config'
import {
  sendIncomingSmsNotification,
  sendSmsSignupNotification,
} from '@/lib/phone/notifications'
import { smsCommandForBody } from '@/lib/phone/sms-commands'
import {
  SMS_SUBSCRIBE_CONFIRMATION,
  SMS_UNSUBSCRIBE_CONFIRMATION,
} from '@/lib/phone/sms-subscription-copy'
import { emptyTwiml, messageTwiml, twimlResponse } from '@/lib/phone/twiml'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'
import { checkRateLimit } from '@/lib/rate-limit'
import { replyToSmsWorkflow } from '@/workflows/reply-to-sms'

const BELL_RATE_LIMIT_MESSAGE =
  '[Bell AI] Too many messages. Please try again later.'

/**
 * Twilio SMS webhook. Stores the inbound message and ignores duplicate
 * MessageSid redeliveries before applying command side effects.
 */
export async function POST(request: Request) {
  if (!isAuthorizedPhoneWebhook(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData()
  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const body = String(form.get('Body') ?? '')
  const messageSid = form.get('MessageSid')
    ? String(form.get('MessageSid'))
    : ''
  const optOutType = String(form.get('OptOutType') ?? '')
  const command = smsCommandForBody(body, optOutType)
  const twilioAlreadyReplied = Boolean(optOutType.trim())
  const metadata = twilioWebhookMetadataFromForm(form, from)
  const webhookEvent = messageSid
    ? await findOrCreatePhoneWebhookEvent({
        eventKey: `sms:${messageSid}`,
        eventType: 'sms',
      })
    : null
  if (webhookEvent?.event.processedAt) return twimlResponse(emptyTwiml())

  const inbound = await createTextMessageWithStatus({
    fromNumber: from,
    toNumber: to,
    body,
    direction: 'inbound',
    twilioSid: messageSid || null,
    status: form.get('SmsStatus') ? String(form.get('SmsStatus')) : 'received',
  })

  if (command === 'subscribe') {
    const existing = await findSmsSubscriberByPhoneNumber(from)
    await subscribeSmsNumber({
      phoneNumber: from,
      source: `sms:${numberLabel(to).toLowerCase()}`,
      processedPhoneWebhookEventId: webhookEvent?.event.id,
    })
    if (!existing?.confirmedAt) {
      after(async () => {
        try {
          await sendSmsSignupNotification({
            phoneNumber: from,
            to,
            source: 'sms',
            metadata,
          })
        } catch (err) {
          console.error('[phone/sms] SMS signup notification failed:', err)
        }
      })
    }
    return twimlResponse(
      twilioAlreadyReplied
        ? emptyTwiml()
        : messageTwiml(SMS_SUBSCRIBE_CONFIRMATION)
    )
  }

  if (command === 'unsubscribe') {
    await unsubscribeSmsNumber(from, {
      processedPhoneWebhookEventId: webhookEvent?.event.id,
    })
    return twimlResponse(
      twilioAlreadyReplied
        ? emptyTwiml()
        : messageTwiml(SMS_UNSUBSCRIBE_CONFIRMATION)
    )
  }

  const lease = webhookEvent
    ? await claimPhoneWebhookEvent(webhookEvent.event.id)
    : null
  if (webhookEvent && !lease) {
    // Another invocation is still working. A 5xx asks Twilio to retry rather
    // than acknowledging a request that may have died before enqueue.
    return twimlResponse(emptyTwiml(), 503)
  }

  // Advanced Opt-Out also emits HELP/INFO classifications. Twilio has already
  // sent the required response, so do not add a Bell reply or duplicate it.
  if (twilioAlreadyReplied) {
    if (webhookEvent && lease) {
      const marked = await markPhoneWebhookEventProcessed(
        webhookEvent.event.id,
        lease
      )
      if (!marked) return twimlResponse(emptyTwiml(), 503)
    }
    return twimlResponse(emptyTwiml())
  }

  if (!(await checkRateLimit('chat', `phone:${from}`, request))) {
    await createTextMessage({
      fromNumber: to,
      toNumber: from,
      body: BELL_RATE_LIMIT_MESSAGE,
      direction: 'outbound',
      twilioSid: null,
      replyToMessageId: inbound.message.id,
      status: 'queued',
    })
    if (webhookEvent && lease) {
      const marked = await markPhoneWebhookEventProcessed(
        webhookEvent.event.id,
        lease
      )
      if (!marked) return twimlResponse(emptyTwiml(), 503)
    }
    return twimlResponse(messageTwiml(BELL_RATE_LIMIT_MESSAGE))
  }

  try {
    // Twilio always supplies MessageSid for real messages. Without it there is
    // no durable dedupe key, so keep the admin notification but do not risk
    // sending duplicate AI replies to a malformed/replayed request.
    if (body.trim() && messageSid) {
      const smsSubscriber = await findSmsSubscriberByPhoneNumber(from)
      const conversation = await getOrCreateSmsBellConversation({
        smsPhoneHash: smsIdentityHash(from),
        smsSubscriberId: smsSubscriber?.id,
      })
      const activeSpan = trace.getActiveSpan()?.spanContext()
      const turn = await createSmsBellTurn({
        conversation,
        inboundTextMessageId: inbound.message.id,
        traceId: activeSpan?.traceId,
      })
      const run = await start(replyToSmsWorkflow, [
        {
          from,
          to,
          inboundMessageId: inbound.message.id,
          conversationId: conversation.id,
          userMessageId: turn.userMessage.id,
          generationId: turn.generation.id,
        },
      ])
      await setBellGenerationWorkflowRunId(turn.generation.id, run.runId)
    }
    if (webhookEvent && lease) {
      const marked = await markPhoneWebhookEventProcessed(
        webhookEvent.event.id,
        lease
      )
      if (!marked) {
        throw new Error(`SMS webhook ${messageSid} lost its processing lease`)
      }
    }
  } catch (err) {
    if (webhookEvent && lease) {
      await releasePhoneWebhookEvent(webhookEvent.event.id, lease)
    }
    throw err
  }

  after(async () => {
    try {
      await sendIncomingSmsNotification({ from, to, body })
    } catch (err) {
      console.error('[phone/sms] incoming SMS notification failed:', err)
    }
  })

  return twimlResponse(emptyTwiml())
}
