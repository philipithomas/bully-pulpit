import { NextResponse } from 'next/server'
import { guardAdmin } from '@/lib/auth/admin'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { isE164, requireSitePhoneNumber } from '@/lib/phone/config'
import { sendSms } from '@/lib/phone/twilio'

/**
 * SMS bodies are capped well above a single segment. Twilio splits long
 * messages, but an unbounded body is an abuse vector and a billing surprise.
 */
const MAX_BODY_LENGTH = 1600

/**
 * Sends an SMS from the configured Twilio number and records it. A Twilio
 * failure is still recorded (status "failed", no sid), matching junk-drawer,
 * so the thread shows the attempt.
 */
export async function POST(request: Request) {
  const session = await guardAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = (await request.json().catch(() => null)) as {
    to?: string
    body?: string
  } | null
  const to = payload?.to?.trim()
  const body = payload?.body?.trim()
  let from: string
  try {
    from = requireSitePhoneNumber()
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }

  if (!to || !isE164(to)) {
    return NextResponse.json(
      { error: 'to must be an E.164 phone number' },
      { status: 400 }
    )
  }
  if (!body) {
    return NextResponse.json({ error: 'body is required' }, { status: 400 })
  }
  if (body.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `body must be ${MAX_BODY_LENGTH} characters or fewer` },
      { status: 400 }
    )
  }

  try {
    const result = await sendSms({ from, to, body })
    const message = await createTextMessage({
      fromNumber: from,
      toNumber: to,
      body,
      direction: 'outbound',
      twilioSid: result.sid,
      status: result.status,
    })
    return NextResponse.json({ message })
  } catch (err) {
    console.error('Failed to send SMS:', err)
    const message = await createTextMessage({
      fromNumber: from,
      toNumber: to,
      body,
      direction: 'outbound',
      twilioSid: null,
      status: 'failed',
    })
    return NextResponse.json(
      { error: 'Twilio rejected the message', message },
      { status: 502 }
    )
  }
}
