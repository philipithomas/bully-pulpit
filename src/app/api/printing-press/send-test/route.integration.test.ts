import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Post } from '@/lib/content/types'

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
vi.mock('@/lib/content/loader', () => ({
  getPostBySlug: vi.fn(),
}))
vi.mock('@/lib/email/render-body', () => ({
  buildEmailBodyHtml: vi.fn(),
}))
vi.mock('@/lib/email/ses', () => ({
  sendNewsletterEmail: vi.fn(),
  sendSimpleEmail: vi.fn(),
}))
vi.mock('@/lib/phone/twilio', () => ({
  sendSms: vi.fn(),
}))

import { POST } from '@/app/api/printing-press/send-test/route'
import { signSession } from '@/lib/auth/jwt'
import { getPostBySlug } from '@/lib/content/loader'
import { textMessages } from '@/lib/db/schema'
import { buildEmailBodyHtml } from '@/lib/email/render-body'
import { sendNewsletterEmail } from '@/lib/email/ses'
import { sendSms } from '@/lib/phone/twilio'
import { db, resetDb } from '@/test/integration/db'
import { clearSessionStore, setSessionCookie } from '@/test/integration/session'

const SLUG = 'hello-world'
const NYC = '+12123473190'
const TEST_PHONE = '+15551234567'

const POST_DATA = {
  slug: SLUG,
  newsletter: 'contraption',
  frontmatter: {
    title: 'Hello world',
    publishedAt: '2026-06-09',
    featured: false,
    draft: false,
  },
  content: '',
  excerpt: '',
} satisfies Post

const EMAIL_BODY = {
  subject: 'Hello world',
  subtitle: null,
  html: '<p>Hello world</p>',
  previewText: 'Preview text',
  bodyText: 'Hello world',
}

function request(body: unknown) {
  return new NextRequest('http://localhost/api/printing-press/send-test', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

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

beforeEach(async () => {
  await resetDb()
  clearSessionStore()
  process.env.ADMIN_EMAILS = 'admin@example.com'
  process.env.PHONE_NUMBER = NYC
  delete process.env.OWNER_PHONE_NUMBER
  vi.mocked(getPostBySlug).mockReset().mockReturnValue(POST_DATA)
  vi.mocked(buildEmailBodyHtml).mockReset().mockResolvedValue(EMAIL_BODY)
  vi.mocked(sendNewsletterEmail).mockReset().mockResolvedValue(undefined)
  vi.mocked(sendSms).mockReset().mockResolvedValue({
    sid: 'SM_TEST',
    status: 'queued',
  })
})

afterEach(() => {
  delete process.env.PHONE_NUMBER
  delete process.env.OWNER_PHONE_NUMBER
  vi.clearAllMocks()
})

describe('POST /api/printing-press/send-test', () => {
  it('rejects non-admins', async () => {
    await signInAs('reader@example.com')

    const response = await POST(request({ slug: SLUG }))

    expect(response.status).toBe(403)
    expect(vi.mocked(sendNewsletterEmail)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it('defaults to sending a test email to the current admin', async () => {
    await signInAs('admin@example.com')

    const response = await POST(request({ slug: SLUG }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      channel: 'email',
      sentTo: 'admin@example.com',
    })
    expect(vi.mocked(sendNewsletterEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: 'Hello world',
        text: 'Hello world',
      })
    )
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it('sends a test text to the configured owner phone', async () => {
    await signInAs('admin@example.com')
    process.env.OWNER_PHONE_NUMBER = TEST_PHONE

    const response = await POST(request({ slug: SLUG, channel: 'sms' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      channel: 'sms',
      sentTo: TEST_PHONE,
    })
    expect(vi.mocked(sendSms)).toHaveBeenCalledWith({
      from: NYC,
      to: TEST_PHONE,
      body: expect.stringContaining('New Contraption post:\nHello world'),
    })
    const smsBody = vi.mocked(sendSms).mock.calls[0][0].body
    expect(smsBody).toContain('utm_source=sms')
    expect(smsBody).not.toContain('utm_medium=')
    expect(smsBody).not.toContain('utm_campaign=')
    expect(smsBody).not.toContain('utm_content=')
    expect(smsBody).toContain('(Reply STOP to unsubscribe.)')

    const rows = await db.select().from(textMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      fromNumber: NYC,
      toNumber: TEST_PHONE,
      body: smsBody,
      direction: 'outbound',
      twilioSid: 'SM_TEST',
      status: 'queued',
    })
  })

  it('rejects an unknown channel', async () => {
    await signInAs('admin@example.com')

    const response = await POST(request({ slug: SLUG, channel: 'fax' }))

    expect(response.status).toBe(400)
    expect(vi.mocked(sendNewsletterEmail)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it.each([
    'email',
    'sms',
  ] as const)('blocks archived newsletter %s test delivery', async (channel) => {
    await signInAs('admin@example.com')
    vi.mocked(getPostBySlug).mockReturnValue({
      ...POST_DATA,
      newsletter: 'tsundoku',
    })

    const response = await POST(request({ slug: SLUG, channel }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'This newsletter is archived and cannot be sent.',
    })
    expect(vi.mocked(sendNewsletterEmail)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
  })

  it('reports when the owner phone is missing', async () => {
    await signInAs('admin@example.com')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(request({ slug: SLUG, channel: 'sms' }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'OWNER_PHONE_NUMBER is not configured',
    })
    expect(vi.mocked(sendSms)).not.toHaveBeenCalled()
    expect(await db.select().from(textMessages)).toHaveLength(0)
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
