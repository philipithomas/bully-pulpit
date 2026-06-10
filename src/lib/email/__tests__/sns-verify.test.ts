import { describe, expect, it, vi } from 'vitest'
import {
  isTrustedSnsUrl,
  type SnsMessage,
  verifySnsSignature,
} from '@/lib/email/sns-verify'
import {
  SNS_TEST_CERT_PEM,
  SNS_TEST_CERT_URL,
  signSnsMessage,
} from '@/test/sns-fixture'

const fetchFixtureCert = vi.fn(async () => SNS_TEST_CERT_PEM)

function notification(overrides: Partial<SnsMessage> = {}): SnsMessage {
  return signSnsMessage({
    Type: 'Notification',
    MessageId: 'm-1',
    TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-events',
    Message: '{"eventType":"Bounce"}',
    Timestamp: '2026-06-10T00:00:00.000Z',
    ...overrides,
  }) as SnsMessage
}

describe('isTrustedSnsUrl', () => {
  it('accepts an https SNS certificate URL', () => {
    expect(isTrustedSnsUrl(SNS_TEST_CERT_URL)).toBe(true)
    expect(
      isTrustedSnsUrl('https://sns.eu-west-2.amazonaws.com/cert.pem')
    ).toBe(true)
  })

  it('rejects plain http even on the right host', () => {
    expect(isTrustedSnsUrl('http://sns.us-east-1.amazonaws.com/cert.pem')).toBe(
      false
    )
  })

  it('rejects non-AWS hosts, including suffix lookalikes', () => {
    expect(isTrustedSnsUrl('https://evil.example.com/cert.pem')).toBe(false)
    expect(
      isTrustedSnsUrl('https://sns.us-east-1.amazonaws.com.evil.com/cert.pem')
    ).toBe(false)
    expect(isTrustedSnsUrl('https://example.amazonaws.com/cert.pem')).toBe(
      false
    )
    expect(isTrustedSnsUrl('not a url')).toBe(false)
  })
})

describe('verifySnsSignature', () => {
  it('accepts a correctly signed Notification (SignatureVersion 1)', async () => {
    expect(await verifySnsSignature(notification(), fetchFixtureCert)).toBe(
      true
    )
  })

  it('accepts SignatureVersion 2 (SHA256)', async () => {
    const message = signSnsMessage(
      {
        Type: 'Notification',
        MessageId: 'm-2',
        TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-events',
        Message: 'hello',
        Timestamp: '2026-06-10T00:00:00.000Z',
      },
      '2'
    ) as SnsMessage
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(true)
  })

  it('signs Subject when present: dropping it after signing fails', async () => {
    const message = notification({ Subject: 'Amazon SES Email Event' })
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(true)
    const { Subject: _dropped, ...withoutSubject } = message
    expect(
      await verifySnsSignature(withoutSubject as SnsMessage, fetchFixtureCert)
    ).toBe(false)
  })

  it('rejects a tampered Message body', async () => {
    const message = notification()
    message.Message = '{"eventType":"Complaint"}'
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(false)
  })

  it('rejects a tampered TopicArn', async () => {
    const message = notification()
    message.TopicArn = 'arn:aws:sns:us-east-1:999999999999:other-topic'
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(false)
  })

  it('accepts a SubscriptionConfirmation and covers SubscribeURL', async () => {
    const message = signSnsMessage({
      Type: 'SubscriptionConfirmation',
      MessageId: 'm-3',
      TopicArn: 'arn:aws:sns:us-east-1:123456789012:ses-events',
      Message: 'You have chosen to subscribe to the topic',
      Timestamp: '2026-06-10T00:00:00.000Z',
      SubscribeURL:
        'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription',
      Token: 'tok-123',
    }) as SnsMessage
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(true)

    message.SubscribeURL = 'https://attacker.example.com/'
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(false)
  })

  it('rejects unsupported signature versions', async () => {
    const message = notification()
    message.SignatureVersion = '3'
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(false)
  })

  it('rejects unknown message types', async () => {
    const message = notification()
    message.Type = 'SomethingElse'
    expect(await verifySnsSignature(message, fetchFixtureCert)).toBe(false)
  })

  it('never fetches a certificate from an untrusted URL', async () => {
    const fetchCert = vi.fn(async () => SNS_TEST_CERT_PEM)
    const message = notification()
    message.SigningCertURL = 'https://evil.example.com/cert.pem'
    expect(await verifySnsSignature(message, fetchCert)).toBe(false)
    expect(fetchCert).not.toHaveBeenCalled()
  })

  it('returns false when the certificate fetch throws', async () => {
    const fetchCert = vi.fn(async () => {
      throw new Error('network down')
    })
    expect(await verifySnsSignature(notification(), fetchCert)).toBe(false)
  })

  it('returns false on a malformed certificate', async () => {
    const fetchCert = vi.fn(async () => 'not a pem')
    expect(await verifySnsSignature(notification(), fetchCert)).toBe(false)
  })
})
