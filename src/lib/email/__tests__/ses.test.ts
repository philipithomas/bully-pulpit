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
} from '@aws-sdk/client-sesv2'
import { deleteSuppressedDestination } from '@/lib/email/ses'

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
