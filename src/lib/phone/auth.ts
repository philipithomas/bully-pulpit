import { createHash, timingSafeEqual } from 'node:crypto'
import { phoneWebhookSecret } from '@/lib/phone/config'

/**
 * Authorizes a Twilio webhook request by comparing the `secret` query
 * parameter against PHONE_WEBHOOK_SECRET. The Twilio console embeds the
 * secret in each webhook URL, mirroring junk-drawer's `/twilio/:secret/...`
 * routes. Fails closed when the env var is unset, and compares digests so the
 * check is constant-time regardless of input length.
 */
export function isAuthorizedPhoneWebhook(request: Request): boolean {
  const expected = phoneWebhookSecret()
  if (!expected) return false
  const provided = new URL(request.url).searchParams.get('secret')
  if (!provided) return false
  const expectedDigest = createHash('sha256').update(expected).digest()
  const providedDigest = createHash('sha256').update(provided).digest()
  return timingSafeEqual(expectedDigest, providedDigest)
}
