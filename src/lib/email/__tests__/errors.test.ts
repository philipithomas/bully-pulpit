import { describe, expect, it } from 'vitest'
import { isPermanentSesError } from '@/lib/email/errors'

function sesError(name: string): Error {
  const err = new Error(`${name}: details`)
  err.name = name
  return err
}

describe('isPermanentSesError', () => {
  it('classifies per-recipient SESv2 failures as permanent', () => {
    expect(isPermanentSesError(sesError('MessageRejected'))).toBe(true)
    expect(isPermanentSesError(sesError('BadRequestException'))).toBe(true)
  })

  it('keeps throttling and account-level failures retryable', () => {
    expect(isPermanentSesError(sesError('TooManyRequestsException'))).toBe(
      false
    )
    expect(isPermanentSesError(sesError('AccountSuspendedException'))).toBe(
      false
    )
    expect(isPermanentSesError(sesError('SendingPausedException'))).toBe(false)
    expect(isPermanentSesError(sesError('LimitExceededException'))).toBe(false)
  })

  it('does not match on message content, only the error name', () => {
    expect(isPermanentSesError(new Error('MessageRejected mentioned'))).toBe(
      false
    )
  })

  it('handles non-Error values', () => {
    expect(isPermanentSesError('MessageRejected')).toBe(false)
    expect(isPermanentSesError(null)).toBe(false)
  })
})
