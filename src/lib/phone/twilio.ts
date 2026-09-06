// Minimal Twilio REST client for outbound SMS and click-to-call. Ported from
// junk-drawer's TwilioClient.send_sms / create_call; dependency-free (plain
// fetch with HTTP Basic auth and form-encoded params).

import { siteConfig } from '@/lib/config'
import { twilioSecret } from '@/lib/phone/config'
import {
  phoneHandoffCallbackUrl,
  type TwilioWebhookMetadata,
} from '@/lib/phone/webhook-metadata'

const TWILIO_REQUEST_TIMEOUT_MS = 30_000

export type SentSms = {
  sid: string
  status: string
}

export type PlacedCall = {
  sid: string
  status: string
}

export class TwilioApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'TwilioApiError'
  }
}

export function isRetryableTwilioError(error: unknown): boolean {
  if (error instanceof TwilioApiError) {
    return error.status === 429 || error.status >= 500
  }
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError'))
  )
}

export function twilioCredentials(): {
  accountSid: string
  authToken: string
} {
  const accountSid = process.env.TWILIO_SID
  const authToken = twilioSecret()
  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_SID or TWILIO_SECRET')
  }
  return { accountSid, authToken }
}

export function twilioBasicAuthHeader(
  accountSid: string,
  authToken: string
): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
}

/**
 * Sends one SMS or MMS through Twilio's Messages API. Throws when credentials
 * are missing or Twilio rejects the request; the caller decides how to record
 * the failure.
 */
export async function sendSms(input: {
  from: string
  to: string
  body: string
  mediaUrl?: string
}): Promise<SentSms> {
  const { accountSid, authToken } = twilioCredentials()
  const form = new URLSearchParams({
    From: input.from,
    To: input.to,
    Body: input.body,
  })
  if (input.mediaUrl) {
    form.set('MediaUrl', input.mediaUrl)
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioBasicAuthHeader(accountSid, authToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      signal: AbortSignal.timeout(TWILIO_REQUEST_TIMEOUT_MS),
    }
  )

  const data = (await response.json().catch(() => ({}))) as {
    sid?: string
    status?: string
    message?: string
  }
  if (!response.ok || !data.sid) {
    throw new TwilioApiError(
      `Twilio send failed (${response.status}): ${data.message ?? 'no sid returned'}`,
      response.status
    )
  }
  return { sid: data.sid, status: data.status ?? 'queued' }
}

function twilioCallError(status: number, message?: string): TwilioApiError {
  return new TwilioApiError(
    `Twilio call failed (${status}): ${message ?? 'no sid returned'}`,
    status
  )
}

/**
 * Places an outbound call. Ported from junk-drawer's TwilioClient.create_call:
 * Twilio dials `to` and, once it answers, fetches `twimlUrl` for instructions.
 * The click-to-call bridge sets `to` to the owner's cell so the owner's phone
 * rings first, then the TwiML <Dial>s the destination.
 */
export async function createCall(input: {
  from: string
  to: string
  twimlUrl: string
}): Promise<PlacedCall> {
  const { accountSid, authToken } = twilioCredentials()

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
    {
      method: 'POST',
      headers: {
        Authorization: twilioBasicAuthHeader(accountSid, authToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: input.from,
        To: input.to,
        Url: input.twimlUrl,
      }),
      signal: AbortSignal.timeout(TWILIO_REQUEST_TIMEOUT_MS),
    }
  )

  const data = (await response.json().catch(() => ({}))) as {
    sid?: string
    status?: string
    message?: string
  }
  if (!response.ok || !data.sid) {
    throw twilioCallError(response.status, data.message)
  }
  return { sid: data.sid, status: data.status ?? 'queued' }
}

export type TwilioCall = {
  sid: string
  from: string
  to: string
  status: string
  direction: string
}

export function isTwilioCallSid(value: string): boolean {
  return /^CA[0-9a-fA-F]{32}$/.test(value)
}

function twilioCallResourceUrl(accountSid: string, callSid: string): string {
  if (!isTwilioCallSid(callSid)) throw new Error('Invalid Twilio CallSid')
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls/${callSid}.json`
}

/** Resolve caller identity from Twilio, never from model-supplied arguments. */
export async function getCall(callSid: string): Promise<TwilioCall> {
  const { accountSid, authToken } = twilioCredentials()
  const response = await fetch(twilioCallResourceUrl(accountSid, callSid), {
    method: 'GET',
    headers: { Authorization: twilioBasicAuthHeader(accountSid, authToken) },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  const data = (await response.json().catch(() => ({}))) as Partial<TwilioCall>
  if (
    !response.ok ||
    data.sid !== callSid ||
    typeof data.from !== 'string' ||
    typeof data.to !== 'string' ||
    typeof data.status !== 'string' ||
    typeof data.direction !== 'string'
  ) {
    // Provider error bodies can contain telephone numbers; do not propagate them.
    throw new TwilioApiError('Twilio call lookup failed', response.status)
  }
  return data as TwilioCall
}

/** Interrupt the parent call's active TwiML with our fixed voicemail route. */
export async function redirectCallToVoicemail(
  callSid: string,
  metadata?: TwilioWebhookMetadata
): Promise<void> {
  const { accountSid, authToken } = twilioCredentials()
  const response = await fetch(twilioCallResourceUrl(accountSid, callSid), {
    method: 'POST',
    headers: {
      Authorization: twilioBasicAuthHeader(accountSid, authToken),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      Url: phoneHandoffCallbackUrl(
        new URL('/api/phone/voicemail', siteConfig.url).href,
        metadata
      ),
      Method: 'POST',
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new TwilioApiError('Twilio voicemail handoff failed', response.status)
  }
}
