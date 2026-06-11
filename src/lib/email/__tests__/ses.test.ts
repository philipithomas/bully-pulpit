import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the AWS SDK client itself so the helper's NotFoundException handling
// runs against the real exception class from the SDK.
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

import {
  type DeleteSuppressedDestinationCommand,
  NotFoundException,
  type SendEmailCommand,
} from '@aws-sdk/client-sesv2'
import {
  deleteSuppressedDestination,
  sendNewsletterEmail,
} from '@/lib/email/ses'

beforeEach(() => {
  sesSend.mockClear()
  sesSend.mockResolvedValue({})
})

describe('deleteSuppressedDestination', () => {
  it('sends DeleteSuppressedDestination for the address', async () => {
    await deleteSuppressedDestination('gone@example.com')

    expect(sesSend).toHaveBeenCalledTimes(1)
    const command = sesSend.mock
      .calls[0][0] as DeleteSuppressedDestinationCommand
    expect(command.input).toEqual({ EmailAddress: 'gone@example.com' })
  })

  it('treats "not found in SES" as success so local-only records clear', async () => {
    sesSend.mockRejectedValueOnce(
      new NotFoundException({
        message: 'Email address not found in the suppression list.',
        $metadata: {},
      })
    )

    await expect(
      deleteSuppressedDestination('local-only@example.com')
    ).resolves.toBeUndefined()
  })

  it('rethrows any other SES error', async () => {
    sesSend.mockRejectedValueOnce(new Error('TooManyRequestsException'))

    await expect(
      deleteSuppressedDestination('gone@example.com')
    ).rejects.toThrow('TooManyRequestsException')
  })
})

describe('sendNewsletterEmail', () => {
  it('appends the unsubscribe link and postal address to the text part', async () => {
    await sendNewsletterEmail({
      to: 'reader@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      unsubscribeUrl: 'https://www.philipithomas.com/unsubscribe?token=abc',
    })

    expect(sesSend).toHaveBeenCalledTimes(1)
    const command = sesSend.mock.calls[0][0] as SendEmailCommand
    const text = command.input.Content?.Simple?.Body?.Text?.Data ?? ''
    expect(text).toContain('Hello\n\n--\n')
    expect(text).toContain(
      'Unsubscribe: https://www.philipithomas.com/unsubscribe?token=abc'
    )
    // CAN-SPAM postal address, matching the HTML footer in
    // templates/newsletter-shell.ts.
    const year = new Date().getFullYear()
    expect(text).toContain(`© ${year}`)
    expect(text).toContain(
      'The Contraption Company LLC\n169 Madison Ave. Suite 2174\nNew York, NY 10016 USA'
    )
  })
})

describe('sendNewsletterEmail unsubscribe headers', () => {
  it('carries exactly one HTTPS URI (the one-click POST target) when a POST URL is supplied', async () => {
    // RFC 8058 section 3.1: with List-Unsubscribe-Post present, the
    // List-Unsubscribe header carries exactly one HTTPS URI. A second URI
    // pointing at the manual landing page would invite receivers to POST at
    // a static page, unsubscribing nobody.
    await sendNewsletterEmail({
      to: 'reader@example.com',
      subject: 'New post',
      html: '<p>Body</p>',
      text: 'Body',
      unsubscribeUrl: 'https://www.philipithomas.com/unsubscribe?token=abc',
      unsubscribePostUrl: 'https://www.philipithomas.com/api/unsubscribe/abc',
    })

    const command = sesSend.mock.calls[0][0] as SendEmailCommand
    expect(command.input.Content?.Simple?.Headers).toEqual([
      {
        Name: 'List-Unsubscribe',
        Value: '<https://www.philipithomas.com/api/unsubscribe/abc>',
      },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ])
  })

  it('falls back to the manual page URL and omits List-Unsubscribe-Post for test sends', async () => {
    await sendNewsletterEmail({
      to: 'reader@example.com',
      subject: 'New post',
      html: '<p>Body</p>',
      text: 'Body',
      unsubscribeUrl: 'https://www.philipithomas.com/unsubscribe',
    })

    const command = sesSend.mock.calls[0][0] as SendEmailCommand
    expect(command.input.Content?.Simple?.Headers).toEqual([
      {
        Name: 'List-Unsubscribe',
        Value: '<https://www.philipithomas.com/unsubscribe>',
      },
    ])
  })
})
