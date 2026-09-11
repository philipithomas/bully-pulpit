import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCall,
  getCall,
  isRetryableTwilioError,
  redirectCallToKeypad,
  redirectCallToVoicemail,
  sendSms,
  TwilioApiError,
  twilioBasicAuthHeader,
} from '@/lib/phone/twilio'

import { decodePhoneHandoffMetadata } from '@/lib/phone/webhook-metadata'

const smsInput = { from: '+12123473190', to: '+15551234567', body: 'hi' }
const callInput = {
  from: '+12123473190',
  to: '+12098677445',
  twimlUrl: 'https://philipithomas.com/api/phone/connect?target=%2B15551234567',
}

beforeEach(() => {
  process.env.TWILIO_SID = 'AC_test'
  process.env.TWILIO_SECRET = 'token_test'
})

afterEach(() => {
  delete process.env.TWILIO_SID
  delete process.env.TWILIO_SECRET
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sendSms', () => {
  it('throws when credentials are missing', async () => {
    delete process.env.TWILIO_SECRET
    await expect(sendSms(smsInput)).rejects.toThrow('Missing TWILIO_SID')
  })

  it('posts form-encoded fields with basic auth and returns sid and status', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ sid: 'SM9', status: 'queued' }), {
          status: 201,
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendSms(smsInput)).resolves.toEqual({
      sid: 'SM9',
      status: 'queued',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC_test/Messages.json'
    )
    expect(init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from('AC_test:token_test').toString('base64')}`,
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(String(init?.body)).toContain('From=%2B12123473190')
    expect(String(init?.body)).toContain('Body=hi')
  })

  it('adds the media URL when sending an MMS', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ sid: 'MM9', status: 'queued' }), {
          status: 201,
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendSms({
      ...smsInput,
      mediaUrl: 'https://www.philipithomas.com/bell.vcf?source=sms&v=1',
    })

    const [, init] = fetchMock.mock.calls[0]
    const form = new URLSearchParams(String(init?.body))
    expect(form.get('MediaUrl')).toBe(
      'https://www.philipithomas.com/bell.vcf?source=sms&v=1'
    )
  })

  it('omits the media URL for an SMS', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ sid: 'SM9', status: 'queued' }), {
          status: 201,
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await sendSms(smsInput)

    const [, init] = fetchMock.mock.calls[0]
    const form = new URLSearchParams(String(init?.body))
    expect(form.has('MediaUrl')).toBe(false)
  })

  it('throws with Twilio error detail on rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'not a valid number' }), {
            status: 400,
          })
      )
    )
    await expect(sendSms(smsInput)).rejects.toThrow(
      'Twilio send failed (400): not a valid number'
    )
  })

  it('throws when the response has no sid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 }))
    )
    await expect(sendSms(smsInput)).rejects.toThrow('no sid returned')
  })
})

describe('isRetryableTwilioError', () => {
  it('treats rate limits, 5xx responses, and network errors as retryable', () => {
    expect(
      isRetryableTwilioError(new TwilioApiError('rate limited', 429))
    ).toBe(true)
    expect(
      isRetryableTwilioError(new TwilioApiError('server error', 503))
    ).toBe(true)
    expect(isRetryableTwilioError(new TypeError('fetch failed'))).toBe(true)
    expect(
      isRetryableTwilioError(
        new DOMException('request timed out', 'TimeoutError')
      )
    ).toBe(true)
  })

  it('treats recipient and credential errors as permanent', () => {
    expect(
      isRetryableTwilioError(new TwilioApiError('not a valid number', 400))
    ).toBe(false)
    expect(isRetryableTwilioError(new Error('missing credentials'))).toBe(false)
  })
})

describe('createCall', () => {
  it('throws when credentials are missing', async () => {
    delete process.env.TWILIO_SID
    await expect(createCall(callInput)).rejects.toThrow('Missing TWILIO_SID')
  })

  it('posts From, To, and Url and returns sid and status', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ sid: 'CA9', status: 'queued' }), {
          status: 201,
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createCall(callInput)).resolves.toEqual({
      sid: 'CA9',
      status: 'queued',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC_test/Calls.json'
    )
    expect(timeout).toHaveBeenCalledWith(30_000)
    expect(init?.signal).toBe(timeout.mock.results[0].value)
    const body = String(init?.body)
    expect(body).toContain('To=%2B12098677445')
    expect(body).toContain('From=%2B12123473190')
    expect(body).toContain('Url=https')
  })

  it('throws with Twilio error detail on rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'call queue full' }), {
            status: 429,
          })
      )
    )
    await expect(createCall(callInput)).rejects.toThrow(
      'Twilio call failed (429): call queue full'
    )
  })
})

describe('verified live call actions', () => {
  const sid = 'CA1234567890abcdef1234567890abcdef'
  const call = {
    sid,
    from: '+14155551234',
    to: '+12123473190',
    status: 'in-progress',
    direction: 'inbound',
  }

  it('fetches the exact call using authentication, a timeout, and no redirects', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(call))
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getCall(sid)).resolves.toEqual(call)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/AC_test/Calls/${sid}.json`
    )
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'error',
      headers: {
        Authorization: twilioBasicAuthHeader('AC_test', 'token_test'),
      },
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    '../Messages',
    'CA123',
    '',
  ])('rejects invalid CallSid %s before sending credentials', async (sid) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(getCall(sid)).rejects.toThrow('Invalid Twilio CallSid')
    await expect(redirectCallToVoicemail(sid)).rejects.toThrow(
      'Invalid Twilio CallSid'
    )
    await expect(redirectCallToKeypad(sid)).rejects.toThrow(
      'Invalid Twilio CallSid'
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed for an incomplete or mismatched call resource', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ ...call, sid: 'CAother' }))
      )
    )
    await expect(getCall(sid)).rejects.toThrow('Twilio call lookup failed')
  })

  it('redirects only the parent CallSid to the fixed same-origin POST route', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(call))
    )
    vi.stubGlobal('fetch', fetchMock)
    await redirectCallToVoicemail(sid)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain(`/Calls/${sid}.json`)
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    const body = new URLSearchParams(String(init?.body))
    expect(Object.fromEntries(body)).toEqual({
      Url: 'https://www.philipithomas.com/api/phone/voicemail',
      Method: 'POST',
    })
  })

  it('does not include provider telephone numbers in action errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ message: `Invalid number ${call.from}` }),
            { status: 400 }
          )
      )
    )
    await expect(redirectCallToVoicemail(sid)).rejects.toThrow(
      'Twilio voicemail handoff failed'
    )
    await expect(getCall(sid)).rejects.toThrow('Twilio call lookup failed')
  })
  it('carries bounded caller metadata on the fixed voicemail URL', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(call))
    )
    vi.stubGlobal('fetch', fetchMock)
    await redirectCallToVoicemail(sid, {
      callSid: sid,
      callerName: 'Jane',
      fromCity: 'San Francisco',
      fromState: 'CA',
    })
    const [, init] = fetchMock.mock.calls[0]
    const body = new URLSearchParams(String(init?.body))
    const destination = new URL(body.get('Url') ?? '')
    expect(destination.origin + destination.pathname).toBe(
      'https://www.philipithomas.com/api/phone/voicemail'
    )
    expect(
      decodePhoneHandoffMetadata(
        destination.searchParams.get('phoneMetadata') ?? ''
      )
    ).toEqual({
      callerName: 'Jane',
      fromCity: 'San Francisco',
      fromState: 'CA',
    })
    expect(body.get('Method')).toBe('POST')
  })

  it('opens only the fixed keypad with authentication and trusted caller metadata', async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(call))
    )
    vi.stubGlobal('fetch', fetchMock)
    await redirectCallToKeypad(sid, { callSid: sid, callerName: 'Jane' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/AC_test/Calls/${sid}.json`
    )
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: twilioBasicAuthHeader('AC_test', 'token_test'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const body = new URLSearchParams(String(init?.body))
    const destination = new URL(body.get('Url') ?? '')
    expect(destination.origin + destination.pathname).toBe(
      'https://www.philipithomas.com/api/phone/keypad'
    )
    expect(
      decodePhoneHandoffMetadata(
        destination.searchParams.get('phoneMetadata') ?? ''
      )
    ).toEqual({ callerName: 'Jane' })
    expect(body.get('Method')).toBe('POST')
    expect([...body.keys()]).toEqual(['Url', 'Method'])
  })

  it('redacts provider errors when a keypad redirect is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { message: `Invalid number ${call.from}` },
          { status: 400 }
        )
      )
    )
    await expect(redirectCallToKeypad(sid)).rejects.toThrow(
      'Twilio keypad handoff failed'
    )
  })
})
