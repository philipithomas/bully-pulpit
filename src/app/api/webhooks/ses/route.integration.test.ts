import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/client', () => import('@/test/integration/db'))

import { POST } from '@/app/api/webhooks/ses/route'
import { emailSuppressions } from '@/lib/db/schema'
import { db, resetDb } from '@/test/integration/db'
import {
  SNS_TEST_CERT_PEM,
  SNS_TEST_CERT_URL,
  signSnsMessage,
} from '@/test/sns-fixture'

const TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:ses-events'
process.env.SES_SNS_TOPIC_ARN = TOPIC_ARN

// The route's default cert fetcher and SubscribeURL confirmation both go
// through global fetch; serve the fixture certificate and a generic 200.
const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const url = String(input)
  if (url === SNS_TEST_CERT_URL) return new Response(SNS_TEST_CERT_PEM)
  return new Response('ok')
})

function request(body: unknown) {
  return new Request('http://localhost/api/webhooks/ses', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function notification(
  sesEvent: unknown,
  overrides: Record<string, string> = {}
) {
  return signSnsMessage({
    Type: 'Notification',
    MessageId: 'm-1',
    TopicArn: TOPIC_ARN,
    Message: JSON.stringify(sesEvent),
    Timestamp: '2026-06-10T00:00:00.000Z',
    ...overrides,
  })
}

function permanentBounce(email: string) {
  return {
    eventType: 'Bounce',
    bounce: {
      bounceType: 'Permanent',
      bounceSubType: 'General',
      bouncedRecipients: [
        { emailAddress: email, diagnosticCode: 'smtp; 550 5.1.1 user unknown' },
      ],
    },
  }
}

beforeEach(async () => {
  await resetDb()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('POST /api/webhooks/ses', () => {
  it('records a permanent bounce with a rich reason, timestamp, and webhook source', async () => {
    const before = Date.now()
    const res = await POST(
      request(notification(permanentBounce('Gone@Example.com')))
    )
    expect(res.status).toBe(200)

    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'gone@example.com',
      reason: 'Permanent bounce (General): smtp; 550 5.1.1 user unknown',
      source: 'ses-webhook',
    })
    expect(rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('records a complaint with its feedback type', async () => {
    const event = {
      eventType: 'Complaint',
      complaint: {
        complainedRecipients: [{ emailAddress: 'angry@example.com' }],
        complaintFeedbackType: 'abuse',
      },
    }
    const res = await POST(request(notification(event)))
    expect(res.status).toBe(200)

    const rows = await db.select().from(emailSuppressions)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email: 'angry@example.com',
      reason: 'Complaint (abuse)',
      source: 'ses-webhook',
    })
  })

  it('is idempotent across SNS redeliveries of the same event', async () => {
    const body = notification(permanentBounce('gone@example.com'))
    await POST(request(body))
    const res = await POST(request(body))
    expect(res.status).toBe(200)
    expect(await db.select().from(emailSuppressions)).toHaveLength(1)
  })

  it('ignores transient bounces and deliveries', async () => {
    const transient = {
      eventType: 'Bounce',
      bounce: {
        bounceType: 'Transient',
        bounceSubType: 'MailboxFull',
        bouncedRecipients: [{ emailAddress: 'full@example.com' }],
      },
    }
    expect((await POST(request(notification(transient)))).status).toBe(200)
    expect(
      (await POST(request(notification({ eventType: 'Delivery' })))).status
    ).toBe(200)
    expect(await db.select().from(emailSuppressions)).toHaveLength(0)
  })

  it('rejects a message from another topic with 403 and writes nothing', async () => {
    const body = signSnsMessage({
      Type: 'Notification',
      MessageId: 'm-2',
      TopicArn: 'arn:aws:sns:us-east-1:999999999999:not-ours',
      Message: JSON.stringify(permanentBounce('gone@example.com')),
      Timestamp: '2026-06-10T00:00:00.000Z',
    })
    const res = await POST(request(body))
    expect(res.status).toBe(403)
    expect(await db.select().from(emailSuppressions)).toHaveLength(0)
    // Rejected before any certificate fetch.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a tampered message with 403 and writes nothing', async () => {
    const body = notification(permanentBounce('victim@example.com'))
    body.Message = JSON.stringify(permanentBounce('attacker-pick@example.com'))
    const res = await POST(request(body))
    expect(res.status).toBe(403)
    expect(await db.select().from(emailSuppressions)).toHaveLength(0)
  })

  it('confirms a subscription by fetching the signed SubscribeURL', async () => {
    const subscribeUrl =
      'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok'
    const body = signSnsMessage({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm-3',
      TopicArn: TOPIC_ARN,
      Message: 'You have chosen to subscribe to the topic',
      Timestamp: '2026-06-10T00:00:00.000Z',
      SubscribeURL: subscribeUrl,
      Token: 'tok',
    })
    const res = await POST(request(body))
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(subscribeUrl)
  })

  it('refuses to fetch a SubscribeURL outside SNS hosts', async () => {
    const body = signSnsMessage({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm-4',
      TopicArn: TOPIC_ARN,
      Message: 'You have chosen to subscribe to the topic',
      Timestamp: '2026-06-10T00:00:00.000Z',
      SubscribeURL: 'https://attacker.example.com/confirm',
      Token: 'tok',
    })
    const res = await POST(request(body))
    expect(res.status).toBe(400)
    // The attacker URL was never fetched. (The certificate may or may not
    // have been: sns-verify caches it per instance across tests.)
    const fetched = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(fetched).not.toContain('https://attacker.example.com/confirm')
  })

  it('returns 400 on a non-JSON body and on a non-SNS payload', async () => {
    expect((await POST(request('not json'))).status).toBe(400)
    expect((await POST(request({ hello: 'world' }))).status).toBe(400)
  })

  it('acknowledges an authentic notification whose Message is not JSON', async () => {
    const body = signSnsMessage({
      Type: 'Notification',
      MessageId: 'm-5',
      TopicArn: TOPIC_ARN,
      Message: 'Successfully validated SNS topic for publishing.',
      Timestamp: '2026-06-10T00:00:00.000Z',
    })
    const res = await POST(request(body))
    expect(res.status).toBe(200)
    expect(await db.select().from(emailSuppressions)).toHaveLength(0)
  })
})
