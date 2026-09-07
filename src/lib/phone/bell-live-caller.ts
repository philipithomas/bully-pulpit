import {
  type CallerSubscriptionStatus,
  callerSubscriptionStatus,
} from '@/lib/phone/caller-subscription'
import { isE164, sitePhoneNumber } from '@/lib/phone/config'
import { getCall, isTwilioCallSid } from '@/lib/phone/twilio'

const CALLER_LOOKUP_TIMEOUT_MS = 2_000

async function verifiedCaller(callSid: string, allowRinging: boolean) {
  if (!isTwilioCallSid(callSid)) return null
  const phoneNumber = sitePhoneNumber()
  if (!phoneNumber) return null
  const call = await getCall(callSid)
  if (
    call.sid !== callSid ||
    call.direction !== 'inbound' ||
    (call.status !== 'in-progress' &&
      !(allowRinging && call.status === 'ringing')) ||
    call.to !== phoneNumber ||
    !isE164(call.from)
  ) {
    return null
  }
  return call
}

/** Private actions require an already answered, active inbound call. */
export function verifiedBellLiveCaller(callSid: string) {
  return verifiedCaller(callSid, false)
}

/** Keep greeting setup bounded across both Twilio and subscription lookups. */
export async function bellLiveCallerSubscriptionStatus(
  callSid: string
): Promise<CallerSubscriptionStatus> {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async (): Promise<CallerSubscriptionStatus> => {
        // answerOnBridge keeps the parent ringing until OpenAI accepts the SIP
        // leg. Greeting personalization is read-only and may run before accept.
        const caller = await verifiedCaller(callSid, true)
        if (!caller || expired) return 'unknown'
        return callerSubscriptionStatus(caller.from)
      })(),
      new Promise<CallerSubscriptionStatus>((resolve) => {
        timer = setTimeout(() => {
          expired = true
          console.warn('[phone/bell-live-caller] Caller lookup timed out')
          resolve('unknown')
        }, CALLER_LOOKUP_TIMEOUT_MS)
      }),
    ])
  } catch {
    console.warn('[phone/bell-live-caller] Caller lookup unavailable')
    return 'unknown'
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
