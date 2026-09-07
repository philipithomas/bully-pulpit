import { findSmsSubscriberByPhoneNumber } from '@/lib/db/queries/sms-subscribers'
import { isE164 } from '@/lib/phone/config'

export type CallerSubscriptionStatus =
  | 'subscribed'
  | 'not_subscribed'
  | 'unknown'

const SUBSCRIPTION_LOOKUP_TIMEOUT_MS = 1_000

/** Caller ID identifies SMS membership only, never an email subscriber. */
export async function callerSubscriptionStatus(
  phoneNumber: string
): Promise<CallerSubscriptionStatus> {
  if (!isE164(phoneNumber)) return 'unknown'

  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      findSmsSubscriberByPhoneNumber(phoneNumber).then(
        (subscriber): CallerSubscriptionStatus =>
          subscriber?.confirmedAt ? 'subscribed' : 'not_subscribed'
      ),
      new Promise<CallerSubscriptionStatus>((resolve) => {
        // Let a call proceed even if the database never settles its query.
        timeout = setTimeout(
          () => resolve('unknown'),
          SUBSCRIPTION_LOOKUP_TIMEOUT_MS
        )
      }),
    ])
  } catch {
    console.warn('[phone/caller-subscription] SMS lookup unavailable')
    return 'unknown'
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
