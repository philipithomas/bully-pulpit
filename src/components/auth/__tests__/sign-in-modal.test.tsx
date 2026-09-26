import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/auth-store', () => ({
  useAuthModal: () => ({ open: true, closeModal: vi.fn() }),
}))

vi.mock('@/components/auth/google-sign-in', () => ({
  useGoogleSignInAvailable: () => true,
  GoogleSignInButton: () => <button type="button">Sign in with Google</button>,
}))

vi.mock('@/components/auth/email-code-confirmation-dialog', () => ({
  EmailCodeConfirmationDialog: () => null,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <header>{children}</header>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

import { SignInModal } from '@/components/auth/sign-in-modal'

describe('SignInModal', () => {
  it('discloses all-newsletter signup before both sign-in methods', () => {
    const html = renderToStaticMarkup(<SignInModal />)
    const disclosure = 'subscribes you to every current newsletter by email'

    expect(html).toContain(disclosure)
    expect(html).toContain('Sign in with Google')
    expect(html).toContain('Continue with email')
    expect(html.indexOf(disclosure)).toBeLessThan(
      html.indexOf('Sign in with Google')
    )
    expect(html.indexOf(disclosure)).toBeLessThan(
      html.indexOf('Continue with email')
    )
  })
})
