// Minimal Twilio REST client for outbound SMS and click-to-call. Ported from
// junk-drawer's TwilioClient.send_sms / create_call; dependency-free (plain
// fetch with HTTP Basic auth and form-encoded params).

import { twilioSecret } from '@/lib/phone/config'

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
  return error instanceof TypeError
}

function twilioCredentials(): { accountSid: string; authToken: string } {
  const accountSid = process.env.TWILIO_SID
  const authToken = twilioSecret()
  if (!accountSid || !authToken) {
    throw new Error('Missing TWILIO_SID or TWILIO_SECRET')
  }
  return { accountSid, authToken }
}

function basicAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
}

/**
 * Sends one SMS through Twilio's Messages API. Throws when credentials are
 * missing or Twilio rejects the request; the caller decides how to record
 * the failure.
 */
export async function sendSms(input: {
  from: string
  to: string
  body: string
}): Promise<SentSms> {
  const { accountSid, authToken } = twilioCredentials()

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(accountSid, authToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: input.from,
        To: input.to,
        Body: input.body,
      }),
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
        Authorization: basicAuthHeader(accountSid, authToken),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: input.from,
        To: input.to,
        Url: input.twimlUrl,
      }),
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
