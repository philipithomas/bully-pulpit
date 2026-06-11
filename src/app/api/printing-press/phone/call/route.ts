import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { siteConfig } from '@/lib/config'
import {
  isE164,
  isOwnedTwilioNumber,
  ownerPhoneNumber,
  phoneWebhookSecret,
} from '@/lib/phone/config'
import { createCall } from '@/lib/phone/twilio'

/**
 * Click-to-call trigger. Admin-only. Rings the owner's phone first (so the
 * owner is never connected to a line they did not initiate), then on answer
 * Twilio fetches the secret-validated /api/phone/connect callback, which
 * <Dial>s the destination presenting one of the owned Twilio numbers as
 * caller id.
 *
 * Hardening: admin-guarded; the destination is E.164-validated and the
 * caller_id is allowlisted to owned Twilio numbers; the callback URL carries
 * the shared webhook secret (validated on the callback) and the values are
 * re-validated and XML-escaped there. The owner number is required (fail
 * closed) so a misconfigured deploy cannot dial an unintended phone.
 */
export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    target?: string
    callerId?: string
  } | null
  const target = payload?.target?.trim()
  const callerId = payload?.callerId?.trim()

  if (!target || !isE164(target)) {
    return NextResponse.json(
      { error: 'target must be an E.164 phone number' },
      { status: 400 }
    )
  }
  if (!callerId || !isOwnedTwilioNumber(callerId)) {
    return NextResponse.json(
      { error: 'callerId must be one of the Twilio numbers' },
      { status: 400 }
    )
  }

  const owner = ownerPhoneNumber()
  if (!owner || !isE164(owner)) {
    return NextResponse.json(
      { error: 'OWNER_PHONE_NUMBER is not configured' },
      { status: 500 }
    )
  }

  const secret = phoneWebhookSecret()
  if (!secret) {
    return NextResponse.json(
      { error: 'PHONE_WEBHOOK_SECRET is not configured' },
      { status: 500 }
    )
  }

  const callbackParams = new URLSearchParams({ secret, target, callerId })
  const twimlUrl = `${siteConfig.url}/api/phone/connect?${callbackParams}`

  try {
    const call = await createCall({ from: callerId, to: owner, twimlUrl })
    return NextResponse.json({ sid: call.sid, status: call.status })
  } catch (err) {
    console.error('Failed to place click-to-call:', err)
    return NextResponse.json(
      { error: 'Twilio rejected the call' },
      { status: 502 }
    )
  }
}
