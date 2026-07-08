import { describe, expect, it, vi } from 'vitest'
import { handleGoogleSignInSuccess } from '@/components/auth/google-sign-in'
import { matchesSubmittedEmail } from '@/components/auth/signup-completion'

describe('handleGoogleSignInSuccess', () => {
  it('passes the Google user to the success handler and respects reload suppression', async () => {
    const onSuccess = vi.fn(() => false)

    await expect(
      handleGoogleSignInSuccess(
        { user: { email: 'Bar@Example.com', name: 'Bar' } },
        onSuccess
      )
    ).resolves.toBe(false)

    expect(onSuccess).toHaveBeenCalledWith({
      email: 'Bar@Example.com',
      name: 'Bar',
    })
  })

  it('reloads by default when no handler takes over navigation', async () => {
    await expect(
      handleGoogleSignInSuccess({ user: { email: 'bar@example.com' } })
    ).resolves.toBe(true)
  })

  it('rejects a successful response that does not identify the signed-in email', async () => {
    await expect(handleGoogleSignInSuccess({ user: {} })).rejects.toThrow(
      'Google sign-in failed'
    )
  })
})

describe('matchesSubmittedEmail', () => {
  it('normalizes case and whitespace for the same email', () => {
    expect(matchesSubmittedEmail(' Foo@Gmail.com ', 'foo@gmail.com')).toBe(true)
  })

  it('does not treat a different Google account as the submitted email', () => {
    expect(matchesSubmittedEmail('bar@gmail.com', 'foo@gmail.com')).toBe(false)
  })
})
