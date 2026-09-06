import { after } from 'next/server'
import { start } from 'workflow/api'
import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventProcessed,
  markPhoneWebhookEventSideEffectObserved,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import {
  findSmsSubscriberByPhoneNumber,
  subscribeSmsNumber,
} from '@/lib/db/queries/sms-subscribers'
import { isE164, numberLabel, sitePhoneNumber } from '@/lib/phone/config'
import { sendSmsSignupNotification } from '@/lib/phone/notifications'
import type { TwilioWebhookMetadata } from '@/lib/phone/webhook-metadata'
import { smsSignupOnboardingWorkflow } from '@/workflows/sms-signup-onboarding'

export type VoiceSubscriptionResult =
  | 'subscribed'
  | 'already_subscribed'
  | 'already_handled'
  | 'unavailable'
  | 'cancelled'

/** Shared by signed keypad requests and Bell's server-verified caller action. */
export async function subscribeVoiceCaller(input: {
  from: string
  to: string
  callSid: string
  source?: 'voice-menu' | 'voice-bell'
  metadata?: TwilioWebhookMetadata
  isCurrent?: () => boolean
}): Promise<VoiceSubscriptionResult> {
  const isCurrent = input.isCurrent ?? (() => true)
  if (!isCurrent()) return 'cancelled'
  const confirmationFrom = sitePhoneNumber()
  if (
    !confirmationFrom ||
    input.to !== confirmationFrom ||
    !isE164(input.from)
  ) {
    return 'unavailable'
  }

  const existing = await findSmsSubscriberByPhoneNumber(input.from)
  if (!isCurrent()) return 'cancelled'

  // Sharing the keypad event key prevents speech and DTMF from enrolling twice.
  const webhookEvent = input.callSid
    ? await findOrCreatePhoneWebhookEvent({
        eventKey: `voice-menu:${input.callSid}:2`,
        eventType: existing?.confirmedAt ? 'voice-menu-existing' : 'voice-menu',
      })
    : null
  if (!isCurrent()) return 'cancelled'
  if (webhookEvent?.event.processedAt) return 'already_handled'
  const lease = webhookEvent
    ? await claimPhoneWebhookEvent(webhookEvent.event.id)
    : null
  if (!isCurrent()) {
    if (webhookEvent && lease) {
      await releasePhoneWebhookEvent(webhookEvent.event.id, lease)
    }
    return 'cancelled'
  }
  if (webhookEvent && !lease) return 'already_handled'

  let newlySubscribed = false
  let enqueued = false
  try {
    // A retry may see a subscriber saved before a failed workflow enqueue. It
    // must finish that original signup; a new call to an active subscription
    // must not send another onboarding message.
    const resumingSignup =
      webhookEvent &&
      !webhookEvent.inserted &&
      webhookEvent.event.eventType === 'voice-menu'
    if (!existing?.confirmedAt || resumingSignup) {
      // No await separates this last turn check from the first mutation.
      // Once signup starts, finish its workflow/fencing even if the caller
      // interrupts; cancellation must not strand a saved subscriber.
      if (!isCurrent()) {
        if (webhookEvent && lease) {
          await releasePhoneWebhookEvent(webhookEvent.event.id, lease)
        }
        return 'cancelled'
      }
      newlySubscribed = !existing?.confirmedAt
      await subscribeSmsNumber({
        phoneNumber: input.from,
        source: `call:${numberLabel(input.to).toLowerCase()}`,
      })
      await start(smsSignupOnboardingWorkflow, [
        { from: confirmationFrom, to: input.from, sendConfirmation: true },
      ])
      enqueued = true
    }
    if (webhookEvent && lease) {
      const marked = await markPhoneWebhookEventProcessed(
        webhookEvent.event.id,
        lease
      )
      if (!marked) throw new Error('Voice signup lost its processing lease')
    }
    if (!newlySubscribed) return 'already_subscribed'
  } catch (error) {
    // A known accepted workflow must not be immediately re-enqueued if the
    // completion acknowledgement fails. Its contact card has its own fence.
    if (webhookEvent && lease) {
      if (enqueued) {
        await markPhoneWebhookEventSideEffectObserved(
          webhookEvent.event.id,
          `voice-signup:${webhookEvent.event.id}`
        ).catch(() => {
          console.error(
            '[phone/voice-subscription] Could not record accepted onboarding'
          )
        })
      } else {
        await releasePhoneWebhookEvent(webhookEvent.event.id, lease)
      }
    }
    throw error
  }

  after(async () => {
    try {
      await sendSmsSignupNotification({
        phoneNumber: input.from,
        to: input.to,
        source: input.source ?? 'voice-menu',
        metadata: input.metadata,
      })
    } catch {
      console.error('[phone/voice-subscription] Admin notification failed')
    }
  })
  return 'subscribed'
}
