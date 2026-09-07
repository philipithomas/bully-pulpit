import { NextResponse } from 'next/server'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { phoneKeypadTwiml } from '@/lib/phone/keypad'
import { twimlResponse } from '@/lib/phone/twiml'

const DIAL_STATUSES = new Set([
  'busy',
  'canceled',
  'completed',
  'failed',
  'no-answer',
])

function boundedInteger(
  value: FormDataEntryValue | null,
  minimum: number,
  maximum: number
): number | null {
  const raw = typeof value === 'string' ? value : ''
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null
}

function opaqueCallSid(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === 'string' ? value : ''
  return /^CA[A-Za-z0-9]{3,64}$/.test(raw) ? raw : null
}

/** Handles the synchronous Twilio <Dial> result after a Bell Live SIP leg. */
export async function POST(request: Request): Promise<Response> {
  const form = await validatedPhoneWebhookForm(request)
  if (!form) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawStatus = String(form.get('DialCallStatus') ?? '')
  const dialCallStatus = DIAL_STATUSES.has(rawStatus) ? rawStatus : 'unknown'

  console.info('[phone/bell-complete]', {
    event: 'bell_live.twilio_dial_complete',
    outcome: 'keypad',
    dialCallStatus,
    dialSipResponseCode: boundedInteger(
      form.get('DialSipResponseCode'),
      100,
      699
    ),
    dialBridged:
      String(form.get('DialBridged') ?? '').toLowerCase() === 'true'
        ? true
        : String(form.get('DialBridged') ?? '').toLowerCase() === 'false'
          ? false
          : null,
    errorCode: boundedInteger(form.get('ErrorCode'), 0, 999_999),
    dialCallDurationSeconds: boundedInteger(
      form.get('DialCallDuration'),
      0,
      3_600
    ),
    callSid: opaqueCallSid(form.get('CallSid')),
    dialCallSid: opaqueCallSid(form.get('DialCallSid')),
  })

  // hangupOnStar ends the SIP leg with "completed", too. Keep the parent
  // call alive for manual choices; no keypad input still leads to voicemail.
  return twimlResponse(
    await phoneKeypadTwiml(form, {
      bellUnavailable: dialCallStatus !== 'completed',
      requestUrl: request.url,
    })
  )
}
