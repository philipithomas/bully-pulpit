import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

// Mock the AWS SDK client itself (not @/lib/email/ses) so the real raw-MIME
// build runs and the test can inspect the bytes SES would receive.
const { sesSend } = vi.hoisted(() => ({
  sesSend: vi.fn(async (_command: unknown) => ({})),
}))
vi.mock('@aws-sdk/client-sesv2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-sesv2')>()
  return {
    ...actual,
    SESv2Client: class {
      send = sesSend
    },
  }
})

import type { SendEmailCommand } from '@aws-sdk/client-sesv2'
import { GET } from '@/app/api/cron/subscriber-backup/route'
import { parseCsv } from '@/lib/csv'
import { type NewSubscriber, subscribers } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'

const CRON_SECRET = 'test-cron-secret'
process.env.CRON_SECRET = CRON_SECRET
process.env.ADMIN_EMAILS = 'admin@example.com,backup@example.com'

const URL = 'http://localhost/api/cron/subscriber-backup'

function request(authorization?: string) {
  return new Request(URL, {
    headers: authorization ? { authorization } : {},
  })
}

async function seedSubscriber(values: NewSubscriber) {
  const [row] = await db.insert(subscribers).values(values).returning()
  return row
}

/** Decodes the base64 attachment part out of the raw multipart/mixed bytes. */
function attachmentText(raw: Uint8Array): string {
  const message = new TextDecoder().decode(raw)
  const boundary = message.match(/boundary="([^"]+)"/)?.[1]
  if (!boundary) throw new Error('no boundary in raw message')
  const attachmentPart = message.split(`--${boundary}`)[2]
  const base64 = attachmentPart.split('\r\n\r\n')[1].trim()
  return Buffer.from(base64.replace(/\r\n/g, ''), 'base64').toString('utf-8')
}

function sentCommand(): SendEmailCommand {
  expect(sesSend).toHaveBeenCalledTimes(1)
  return sesSend.mock.calls[0][0] as SendEmailCommand
}

beforeEach(async () => {
  sesSend.mockClear()
  await resetDb()
})

describe('cron auth', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await GET(request())
    expect(res.status).toBe(401)
    expect(sesSend).not.toHaveBeenCalled()
  })

  it('returns 401 with the wrong bearer token', async () => {
    const res = await GET(request('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    expect(sesSend).not.toHaveBeenCalled()
  })
})

describe('backup send', () => {
  it('emails all admins one CSV attachment with every subscriber', async () => {
    await seedSubscriber({
      email: 'evil@example.com',
      name: '=SUM(A1)',
      source: '=2+5',
      confirmedAt: new Date(),
    })
    await seedSubscriber({
      email: 'plain@example.com',
      name: 'Plain Name',
      source: 'https://example.org/',
      subscribedPostcard: false,
    })

    const res = await GET(request(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 2, subscriberCount: 2 })

    const input = sentCommand().input
    expect(input.Destination?.ToAddresses).toEqual([
      'admin@example.com',
      'backup@example.com',
    ])
    expect(input.Content?.Raw?.Data).toBeInstanceOf(Uint8Array)

    const raw = input.Content?.Raw?.Data as Uint8Array
    const message = new TextDecoder().decode(raw)
    expect(message).toMatch(/Subject: Subscriber backup \d{4}-\d{2}-\d{2}\r\n/)
    expect(message).toContain('To: admin@example.com, backup@example.com\r\n')
    expect(message).toMatch(
      /Content-Disposition: attachment; filename="subscribers-\d{4}-\d{2}-\d{2}\.csv"\r\n/
    )
    expect(message).toContain('Content-Type: text/csv; charset=utf-8\r\n')

    const parsed = parseCsv(attachmentText(raw))
    expect(parsed[0]).toEqual([
      'email',
      'name',
      'postcard',
      'contraption',
      'workshop',
      'tsundoku',
      'confirmed',
      'source',
      'created_at',
    ])
    const data = parsed.slice(1)
    expect(data).toHaveLength(2)

    // Newest first: plain@ was inserted second.
    expect(data[0][0]).toBe('plain@example.com')
    expect(data[0][1]).toBe('Plain Name')
    expect(data[0][2]).toBe('false')
    expect(data[0][6]).toBe('false')
    expect(data[0][7]).toBe('https://example.org/')

    // Formula-leading name and source cells are neutralized with a leading
    // apostrophe.
    expect(data[1][0]).toBe('evil@example.com')
    expect(data[1][1]).toBe("'=SUM(A1)")
    expect(data[1][6]).toBe('true')
    expect(data[1][7]).toBe("'=2+5")
  })

  it('states the subscriber count in the plain-text body', async () => {
    await seedSubscriber({ email: 'only@example.com' })

    await GET(request(`Bearer ${CRON_SECRET}`))

    const raw = sentCommand().input.Content?.Raw?.Data as Uint8Array
    const message = new TextDecoder().decode(raw)
    const boundary = message.match(/boundary="([^"]+)"/)?.[1]
    const textBase64 = message
      .split(`--${boundary}`)[1]
      .split('\r\n\r\n')[1]
      .trim()
    const text = Buffer.from(
      textBase64.replace(/\r\n/g, ''),
      'base64'
    ).toString('utf-8')
    expect(text).toMatch(
      /^The attached CSV contains all 1 subscriber as of \d{4}-\d{2}-\d{2}\.$/
    )
  })

  it('returns 500 when the SES send fails', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    sesSend.mockRejectedValueOnce(new Error('SES is down'))
    await seedSubscriber({ email: 'a@example.com' })

    const res = await GET(request(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Backup failed' })
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
