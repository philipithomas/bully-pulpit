import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'
import { validatedPhoneWebhookForm } from '@/lib/phone/auth'
import { bellLiveSipUri } from '@/lib/phone/bell-live'
import { PHONE_IVR_FALLBACK_PROMPTS } from '@/lib/phone/ivr-audio'
import {
  bellLiveTwiml,
  playAndHangupTwiml,
  twimlResponse,
  voicemailTwiml,
} from '@/lib/phone/twiml'
import { voicemailCallbackUrls } from '@/lib/phone/voicemail-callbacks'
import { twilioWebhookMetadataFromForm } from '@/lib/phone/webhook-metadata'

const DIAL_STATUSES = new Set([
  'busy',
  'canceled',
  'completed',
  'failed',
  'no-answer',
])

function retryAttempt(request: Request): 0 | 1 | null {
  const value = new URL(request.url).searchParams.get('attempt')
  if (value === null || value === '0') return 0
  return value === '1' ? 1 : null
}

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
  const attempt = retryAttempt(request)
  const callSid = String(form.get('CallSid') ?? '')
  const retrySipUri =
    dialCallStatus === 'failed' && attempt === 0
      ? bellLiveSipUri(callSid)
      : null
  const outcome =
    dialCallStatus === 'completed'
      ? 'completed'
      : retrySipUri
        ? 'retrying'
        : 'voicemail'

  console.info('[phone/bell-complete]', {
    event: 'bell_live.twilio_dial_complete',
    outcome,
    retryAttempt: attempt,
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

  if (dialCallStatus === 'completed') {
    return twimlResponse(playAndHangupTwiml('goodbye'))
  }

  if (retrySipUri) {
    return twimlResponse(
      bellLiveTwiml({
        sipUri: retrySipUri,
        actionUrl: `${siteConfig.url}/api/phone/bell-complete?attempt=1`,
      })
    )
  }

  const from = String(form.get('From') ?? 'Unknown')
  const to = String(form.get('To') ?? 'Unknown')
  const metadata = twilioWebhookMetadataFromForm(form, from)
  return twimlResponse(
    voicemailTwiml({
      greeting: PHONE_IVR_FALLBACK_PROMPTS.bellUnavailable,
      greetingFallback: 'bellUnavailable',
      ...voicemailCallbackUrls({ from, to, metadata }),
    })
  )
}
