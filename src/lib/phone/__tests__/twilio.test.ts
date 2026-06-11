import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCall, sendSms } from '@/lib/phone/twilio'

const smsInput = { from: '+12123473190', to: '+15551234567', body: 'hi' }
const callInput = {
  from: '+12123473190',
  to: '+12098677445',
  twimlUrl: 'https://philipithomas.com/api/phone/connect?secret=x',
}

beforeEach(() => {
  process.env.TWILIO_ACCOUNT_SID = 'AC_test'
  process.env.TWILIO_AUTH_TOKEN = 'token_test'
})

afterEach(() => {
  delete process.env.TWILIO_ACCOUNT_SID
  delete process.env.TWILIO_AUTH_TOKEN
  vi.unstubAllGlobals()
})

describe('sendSms', () => {
  it('throws when credentials are missing', async () => {
    delete process.env.TWILIO_AUTH_TOKEN
    await expect(sendSms(smsInput)).rejects.toThrow(
      'Missing TWILIO_ACCOUNT_SID'
    )
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
    expect(String(init?.body)).toContain('From=%2B12123473190')
    expect(String(init?.body)).toContain('Body=hi')
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

describe('createCall', () => {
  it('throws when credentials are missing', async () => {
    delete process.env.TWILIO_ACCOUNT_SID
    await expect(createCall(callInput)).rejects.toThrow(
      'Missing TWILIO_ACCOUNT_SID'
    )
  })

  it('posts From, To, and Url and returns sid and status', async () => {
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
