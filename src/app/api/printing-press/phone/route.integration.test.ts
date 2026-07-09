import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sessionSubscribers = vi.hoisted(() => new Map<string, unknown>())

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('next/headers', () => import('@/test/integration/session'))
vi.mock('@/lib/db/queries/subscribers', async (importActual) => {
  const actual =
    await importActual<typeof import('@/lib/db/queries/subscribers')>()
  return {
    ...actual,
    findByUuid: vi.fn((uuid: string) =>
      sessionSubscribers.has(uuid)
        ? sessionSubscribers.get(uuid)
        : actual.findByUuid(uuid)
    ),
  }
})
vi.mock('@/lib/phone/twilio', () => ({
  sendSms: vi.fn(),
  createCall: vi.fn(),
}))

import { POST as connectPost } from '@/app/api/phone/connect/route'
import { POST as callPost } from '@/app/api/printing-press/phone/call/route'
import { GET as conversationsGet } from '@/app/api/printing-press/phone/conversations/route'
import { POST as sendPost } from '@/app/api/printing-press/phone/send/route'
import { signSession } from '@/lib/auth/jwt'
import { createTextMessage } from '@/lib/db/queries/text-messages'
import { textMessages } from '@/lib/db/schema'
import { createCall, sendSms } from '@/lib/phone/twilio'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'
import { twilioPostRequest } from '@/test/twilio'

const NYC = '+12123473190'
const ALICE = '+15551110001'
const OWNER = '+12098677445'
const SECRET = 'test-webhook-secret'

async function signInAs(email: string) {
  const uuid = randomUUID()
  const subscriber = {
    id: -1,
    uuid,
    email,
    name: null,
    confirmedAt: new Date(),
    subscribedPostcard: false,
    subscribedContraption: false,
    subscribedWorkshop: false,
    subscribedTsundoku: false,
    source: null,
    sessionVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  sessionSubscribers.set(uuid, subscriber)
  setSessionCookie(await signSession(subscriber))
}

function conversationsRequest(qs = '') {
  return new NextRequest(
    `http://localhost/api/printing-press/phone/conversations${qs}`
  )
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await resetDb()
  clearSessionStore()
  process.env.PHONE_NUMBER = NYC
  vi.clearAllMocks()
})

afterEach(() => {
  delete process.env.PHONE_NUMBER
})

describe('GET /api/printing-press/phone/conversations', () => {
  it('rejects non-admins', async () => {
    await signInAs('reader@example.com')
    const response = await conversationsGet(conversationsRequest())
    expect(response.status).toBe(403)
  })

  it('lists conversations for an admin', async () => {
    await signInAs('admin@example.com')
    await createTextMessage({
      fromNumber: ALICE,
      toNumber: NYC,
      body: 'hello',
      direction: 'inbound',
      twilioSid: 'SM1',
    })
    const response = await conversationsGet(conversationsRequest())
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.conversations).toHaveLength(1)
    expect(data.conversations[0].number).toBe(ALICE)
    expect(data.conversations[0].lastMessage.body).toBe('hello')
  })

  it('returns one thread when number is given', async () => {
    await signInAs('admin@example.com')
    await createTextMessage({
      fromNumber: ALICE,
      toNumber: NYC,
      body: 'hello',
      direction: 'inbound',
      twilioSid: 'SM1',
    })
    const response = await conversationsGet(
      conversationsRequest(`?number=${encodeURIComponent(ALICE)}`)
    )
    const data = await response.json()
    expect(data.messages).toHaveLength(1)
    expect(data.messages[0].body).toBe('hello')
  })
})

describe('POST /api/printing-press/phone/send', () => {
  it('rejects non-admins', async () => {
    await signInAs('reader@example.com')
    const response = await sendPost(
      jsonRequest('/api/printing-press/phone/send', {
        to: ALICE,
        body: 'hi',
      })
    )
    expect(response.status).toBe(403)
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it('rejects a non-E.164 recipient', async () => {
    await signInAs('admin@example.com')
    const response = await sendPost(
      jsonRequest('/api/printing-press/phone/send', {
        to: '555-1234',
        body: 'hi',
      })
    )
    expect(response.status).toBe(400)
  })

  it('rejects an empty body', async () => {
    await signInAs('admin@example.com')
    const response = await sendPost(
      jsonRequest('/api/printing-press/phone/send', {
        to: ALICE,
        body: '  ',
      })
    )
    expect(response.status).toBe(400)
  })

  it('rejects an over-long body', async () => {
    await signInAs('admin@example.com')
    const response = await sendPost(
      jsonRequest('/api/printing-press/phone/send', {
        to: ALICE,
        body: 'x'.repeat(1601),
      })
    )
    expect(response.status).toBe(400)
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it('sends through Twilio and records the outbound message', async () => {
    await signInAs('admin@example.com')
    vi.mocked(sendSms).mockResolvedValueOnce({ sid: 'SM9', status: 'queued' })

    const response = await sendPost(
      jsonRequest('/api/printing-press/phone/send', {
        to: ALICE,
        body: 'On my way',
      })
    )
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.message).toMatchObject({
      fromNumber: NYC,
      toNumber: ALICE,
      body: 'On my way',
      direction: 'outbound',
      twilioSid: 'SM9',
      status: 'queued',
    })
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: NYC,
      to: ALICE,
      body: 'On my way',
    })
  })

  it('records a failed row when Twilio rejects the send', async () => {
    await signInAs('admin@example.com')
    vi.mocked(sendSms).mockRejectedValueOnce(new Error('invalid number'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await sendPost(
      jsonRequest('/api/printing-press/phone/send', {
        to: ALICE,
        body: 'On my way',
      })
    )
    expect(response.status).toBe(502)
    const rows = await db.select().from(textMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      direction: 'outbound',
      status: 'failed',
      twilioSid: null,
    })
    expect(consoleError).toHaveBeenCalled()
  })
})

describe('POST /api/printing-press/phone/call (click-to-call trigger)', () => {
  beforeEach(() => {
    process.env.TWILIO_SECRET = SECRET
    process.env.OWNER_PHONE_NUMBER = OWNER
  })

  afterEach(() => {
    delete process.env.TWILIO_SECRET
    delete process.env.OWNER_PHONE_NUMBER
  })

  it('rejects non-admins', async () => {
    await signInAs('reader@example.com')
    const response = await callPost(
      jsonRequest('/api/printing-press/phone/call', {
        target: ALICE,
      })
    )
    expect(response.status).toBe(403)
    expect(vi.mocked(createCall)).not.toHaveBeenCalled()
  })

  it('rejects a non-E.164 target', async () => {
    await signInAs('admin@example.com')
    const response = await callPost(
      jsonRequest('/api/printing-press/phone/call', {
        target: '555-1234',
      })
    )
    expect(response.status).toBe(400)
    expect(vi.mocked(createCall)).not.toHaveBeenCalled()
  })

  it('errors when the owner number is unset', async () => {
    delete process.env.OWNER_PHONE_NUMBER
    await signInAs('admin@example.com')
    const response = await callPost(
      jsonRequest('/api/printing-press/phone/call', {
        target: ALICE,
      })
    )
    expect(response.status).toBe(500)
    expect(vi.mocked(createCall)).not.toHaveBeenCalled()
  })

  it('rings the owner first with a signed connect callback', async () => {
    await signInAs('admin@example.com')
    vi.mocked(createCall).mockResolvedValueOnce({
      sid: 'CA9',
      status: 'queued',
    })

    const response = await callPost(
      jsonRequest('/api/printing-press/phone/call', {
        target: ALICE,
      })
    )
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toMatchObject({ sid: 'CA9', status: 'queued' })

    const call = vi.mocked(createCall).mock.calls[0][0]
    expect(call.from).toBe(NYC)
    expect(call.to).toBe(OWNER)
    expect(call.twimlUrl).toContain('/api/phone/connect?')
    expect(call.twimlUrl).toContain(`target=${encodeURIComponent(ALICE)}`)
    expect(call.twimlUrl).not.toContain('secret=')
    expect(call.twimlUrl).not.toContain('callerId=')
  })
})

describe('POST /api/phone/connect (click-to-call callback)', () => {
  beforeEach(() => {
    process.env.TWILIO_SECRET = SECRET
  })

  afterEach(() => {
    delete process.env.TWILIO_SECRET
  })

  function connectRequest(target: string, signature?: string) {
    const url = new URL('https://philipithomas.com/api/phone/connect')
    url.searchParams.set('target', target)
    return twilioPostRequest(url.toString(), {}, SECRET, { signature })
  }

  it('rejects an invalid signature', async () => {
    const response = await connectPost(connectRequest(ALICE, 'invalid'))
    expect(response.status).toBe(401)
  })

  it('rejects a non-E.164 target', async () => {
    const response = await connectPost(connectRequest('evil'))
    expect(response.status).toBe(400)
  })

  it('returns XML-escaped Dial TwiML', async () => {
    const response = await connectPost(connectRequest(ALICE))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/xml')
    const xml = await response.text()
    expect(xml).toContain(`<Dial callerId="${NYC}">${ALICE}</Dial>`)
  })
})
