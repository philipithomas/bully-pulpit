import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))
vi.mock('@/lib/email/ses', () =>
  import('@/test/integration/mocks').then((m) => m.sesMock())
)

import { POST as smsPost } from '@/app/api/phone/sms/route'
import { textMessages } from '@/lib/db/schema'
import { sendSimpleEmail } from '@/lib/email/ses'
import { db, resetDb } from '@/test/integration/db'

const SECRET = 'test-webhook-secret'

function smsRequest(form: Record<string, string>, secret = SECRET) {
  return new Request(
    `https://philipithomas.com/api/phone/sms?secret=${secret}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    }
  )
}

beforeEach(async () => {
  await resetDb()
  process.env.PHONE_WEBHOOK_SECRET = SECRET
  process.env.ADMIN_EMAILS = 'one@example.com, two@example.com'
})

afterEach(() => {
  delete process.env.PHONE_WEBHOOK_SECRET
  delete process.env.ADMIN_EMAILS
  vi.clearAllMocks()
})

describe('POST /api/phone/sms', () => {
  it('rejects a wrong secret without touching the database', async () => {
    const response = await smsPost(
      smsRequest({ From: '+1', To: '+2', Body: 'x' }, 'wrong')
    )
    expect(response.status).toBe(401)
    expect(await db.select().from(textMessages)).toHaveLength(0)
  })

  it('stores the inbound message and emails a notification', async () => {
    const response = await smsPost(
      smsRequest({
        From: '+15551234567',
        To: '+12123473190',
        Body: 'Running late',
        MessageSid: 'SM123',
        SmsStatus: 'received',
      })
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<Response></Response>')

    const rows = await db.select().from(textMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fromNumber: '+15551234567',
      toNumber: '+12123473190',
      body: 'Running late',
      direction: 'inbound',
      twilioSid: 'SM123',
      status: 'received',
    })

    expect(vi.mocked(sendSimpleEmail)).toHaveBeenCalledTimes(1)
    const email = vi.mocked(sendSimpleEmail).mock.calls[0][0]
    expect(email.to).toEqual(['one@example.com', 'two@example.com'])
    expect(email.subject).toBe('SMS from +15551234567 to NYC')
    expect(email.html).toContain('Running late')
  })

  it('does not duplicate the row when Twilio redelivers the webhook', async () => {
    const form = {
      From: '+15551234567',
      To: '+12123473190',
      Body: 'Running late',
      MessageSid: 'SM123',
    }
    await smsPost(smsRequest(form))
    await smsPost(smsRequest(form))
    expect(await db.select().from(textMessages)).toHaveLength(1)
  })
})
