import {
  claimPhoneWebhookEvent,
  findOrCreatePhoneWebhookEvent,
  markPhoneWebhookEventSideEffectObserved,
  releasePhoneWebhookEvent,
} from '@/lib/db/queries/phone-webhook-events'
import { isE164, sitePhoneNumber } from '@/lib/phone/config'
import {
  getCall,
  isTwilioCallSid,
  redirectCallToVoicemail,
  TwilioApiError,
} from '@/lib/phone/twilio'
import { subscribeVoiceCaller } from '@/lib/phone/voice-subscription'
import type { TwilioWebhookMetadata } from '@/lib/phone/webhook-metadata'

export type BellLiveActionResult = {
  status: string
  message: string
  disclosure?: string
}

export const BELL_VOICE_SUBSCRIPTION_DISCLOSURE =
  'Would you like recurring new-post texts from philipithomas.com on the number you called from? A new or reactivated subscription includes one Bell contact-card multimedia message. Frequency varies; message and data rates may apply. Text STOP to unsubscribe or HELP for help. Please say yes or no.'

const unavailable: BellLiveActionResult = {
  status: 'unavailable',
  message: 'That action is unavailable right now. Do not claim it succeeded.',
}

const cancelled: BellLiveActionResult = {
  status: 'cancelled',
  message: 'The caller interrupted this request. No action was taken.',
}

function exactArguments(
  args: unknown,
  keys: string[]
): args is Record<string, unknown> {
  return (
    typeof args === 'object' &&
    args !== null &&
    !Array.isArray(args) &&
    Object.keys(args).length === keys.length &&
    keys.every((key) => Object.hasOwn(args, key))
  )
}

/**
 * A private controller bound to the authenticated SIP invitation's parent
 * CallSid. Tool arguments cannot choose a telephone number or redirect URL.
 */
export function createBellLiveActionHandler(
  callSid: string,
  metadata?: TwilioWebhookMetadata
) {
  let handedOff = false
  let confirmationPreparedAt: number | null = null
  let confirmationDelivered = false
  let pending: Promise<unknown> = Promise.resolve()

  function clearSubscriptionConfirmation() {
    confirmationPreparedAt = null
    confirmationDelivered = false
  }

  function cancelAction(callerTurn: number): BellLiveActionResult {
    if (
      confirmationPreparedAt !== null &&
      callerTurn >= confirmationPreparedAt
    ) {
      clearSubscriptionConfirmation()
    }
    return cancelled
  }

  async function verifiedCaller() {
    if (!isTwilioCallSid(callSid)) return null
    const call = await getCall(callSid)
    if (
      call.sid !== callSid ||
      call.direction !== 'inbound' ||
      call.status !== 'in-progress' ||
      call.to !== sitePhoneNumber() ||
      !isE164(call.from)
    ) {
      return null
    }
    return call
  }

  async function perform(
    name: string,
    args: unknown,
    callerTurn: number,
    isCurrent: () => boolean
  ): Promise<BellLiveActionResult> {
    if (!Number.isSafeInteger(callerTurn) || callerTurn < 0) return unavailable
    if (!isCurrent()) return cancelAction(callerTurn)
    if (name === 'start_voicemail') {
      if (!exactArguments(args, [])) return unavailable
      clearSubscriptionConfirmation()
      if (handedOff) {
        return {
          status: 'handed_off',
          message: 'The voicemail handoff is underway.',
        }
      }
      if (!(await verifiedCaller())) return unavailable
      if (!isCurrent()) return cancelAction(callerTurn)
      const { event } = await findOrCreatePhoneWebhookEvent({
        eventKey: `bell-live:${callSid}:voicemail`,
        eventType: 'bell-live-action',
      })
      if (!isCurrent()) return cancelAction(callerTurn)
      if (event.processedAt) {
        handedOff = true
        return {
          status: 'handed_off',
          message: 'The voicemail handoff is underway.',
        }
      }
      const lease = await claimPhoneWebhookEvent(event.id)
      if (!isCurrent()) {
        if (lease) await releasePhoneWebhookEvent(event.id, lease)
        return cancelAction(callerTurn)
      }
      if (!lease) {
        handedOff = true
        return {
          status: 'handoff_pending',
          message: 'The voicemail handoff is pending.',
        }
      }
      // Updating parent TwiML closes the SIP leg before its REST response may
      // arrive. Suppress the sideband's failure fallback before that race.
      handedOff = true
      try {
        await redirectCallToVoicemail(callSid, { ...metadata, callSid })
      } catch (error) {
        if (
          error instanceof TwilioApiError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          handedOff = false
          await releasePhoneWebhookEvent(event.id, lease)
          return unavailable
        }
        // A timeout or server error can follow an accepted redirect. Keep its
        // lease and handoff state; a second redirect could interrupt recording.
        return {
          status: 'handoff_pending',
          message:
            'The voicemail handoff could not be confirmed. Do not repeat the action.',
        }
      }
      try {
        await markPhoneWebhookEventSideEffectObserved(
          event.id,
          `bell-live:${callSid}:voicemail`
        )
      } catch {
        console.error(
          '[phone/bell-live-action] Could not record completed handoff'
        )
      }
      return {
        status: 'handed_off',
        message: 'Voicemail is starting. Stop speaking.',
      }
    }

    if (
      name !== 'subscribe_caller' ||
      !exactArguments(args, ['confirmed']) ||
      typeof args.confirmed !== 'boolean' ||
      handedOff
    ) {
      return unavailable
    }
    if (!args.confirmed) {
      clearSubscriptionConfirmation()
      if (!(await verifiedCaller())) return unavailable
      if (!isCurrent()) return cancelAction(callerTurn)
      confirmationPreparedAt = callerTurn
      return {
        status: 'confirmation_required',
        message: BELL_VOICE_SUBSCRIPTION_DISCLOSURE,
        disclosure: BELL_VOICE_SUBSCRIPTION_DISCLOSURE,
      }
    }
    // Both completed disclosure playback and a later server-observed caller
    // turn are required; generating the disclosure is not proof it was heard.
    if (
      confirmationPreparedAt === null ||
      !confirmationDelivered ||
      callerTurn <= confirmationPreparedAt
    ) {
      return {
        status: 'confirmation_required',
        message:
          'First call subscribe_caller with confirmed false, let the full disclosure finish playing, and wait for the caller to explicitly say yes.',
      }
    }
    clearSubscriptionConfirmation()
    const caller = await verifiedCaller()
    if (!caller) return unavailable
    if (!isCurrent()) return cancelAction(callerTurn)
    const status = await subscribeVoiceCaller({
      from: caller.from,
      to: caller.to,
      callSid,
      metadata: { ...metadata, callSid },
      source: 'voice-bell',
      isCurrent,
    })
    if (status === 'unavailable') return unavailable
    if (status === 'cancelled') return cancelAction(callerTurn)
    return {
      status,
      message:
        status === 'subscribed'
          ? 'You are subscribed to new-post texts. Text STOP to unsubscribe or HELP for help. We can keep talking.'
          : status === 'already_subscribed'
            ? 'You are already subscribed to new-post texts. We can keep talking.'
            : 'This signup request has already been handled. Do not promise a new text.',
    }
  }

  return {
    execute(
      name: string,
      args: unknown,
      callerTurn: number,
      isCurrent: () => boolean = () => true
    ): Promise<BellLiveActionResult> {
      // Different model tool-call IDs still share the same action/consent state.
      const result = pending
        .then(() => perform(name, args, callerTurn, isCurrent))
        .catch(() => {
          cancelAction(callerTurn)
          return unavailable
        })
      pending = result
      return result
    },
    /** Only the trusted sideband may acknowledge complete, uninterrupted audio. */
    markSubscriptionDisclosureDelivered(callerTurn: number): boolean {
      if (handedOff || confirmationPreparedAt !== callerTurn) return false
      confirmationDelivered = true
      return true
    },
    /** Invalidates an interrupted disclosure and any late playback acknowledgement. */
    cancelSubscriptionDisclosure(callerTurn: number): void {
      if (confirmationPreparedAt === callerTurn) clearSubscriptionConfirmation()
    },
    hasHandedOff: () => handedOff,
  }
}

export type BellLiveActionHandler = ReturnType<
  typeof createBellLiveActionHandler
>
