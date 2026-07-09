import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { siteConfig } from '@/lib/config'
import {
  isE164,
  ownerPhoneNumber,
  requireSitePhoneNumber,
  twilioSecret,
} from '@/lib/phone/config'
import { createCall } from '@/lib/phone/twilio'

/**
 * Click-to-call trigger. Admin-only. Rings the owner's phone first (so the
 * owner is never connected to a line they did not initiate), then on answer
 * Twilio fetches the secret-validated /api/phone/connect callback, which
 * <Dial>s the destination presenting the configured Twilio number as caller id.
 *
 * Hardening: admin-guarded; the destination is E.164-validated and the
 * caller_id comes from server config; the callback URL carries the shared
 * webhook secret (validated on the callback), and the values are re-validated
 * and XML-escaped there. The owner number is required (fail closed) so a
 * misconfigured deploy cannot dial an unintended phone.
 */
export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    target?: string
  } | null
  const target = payload?.target?.trim()

  if (!target || !isE164(target)) {
    return NextResponse.json(
      { error: 'target must be an E.164 phone number' },
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

  let callerId: string
  try {
    callerId = requireSitePhoneNumber()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }

  const secret = twilioSecret()
  if (!secret) {
    return NextResponse.json(
      { error: 'TWILIO_SECRET is not configured' },
      { status: 500 }
    )
  }

  const callbackParams = new URLSearchParams({ secret, target })
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
