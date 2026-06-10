import { describe, expect, it } from 'vitest'
import {
  joinNames,
  renderConfirmationEmail,
  renderConfirmationText,
} from '@/lib/email/templates/confirmation'

const base = {
  code: '123456',
  magicLink: 'https://www.philipithomas.com/auth/verify?token=abc',
}

const DARK_MEDIA_QUERY = '@media (prefers-color-scheme: dark)'

/** The dark-mode media block of a rendered template, for variant parity. */
function darkBlock(html: string): string {
  const start = html.indexOf(DARK_MEDIA_QUERY)
  const end = html.indexOf('</style>')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return html.slice(start, end)
}

describe('joinNames', () => {
  it('joins per the colophon list style', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Contraption'])).toBe('Contraption')
    expect(joinNames(['Contraption', 'Postcard'])).toBe(
      'Contraption and Postcard'
    )
    expect(joinNames(['Contraption', 'Workshop', 'Postcard'])).toBe(
      'Contraption, Workshop, and Postcard'
    )
  })
})

describe('sign-in variant (default)', () => {
  const html = renderConfirmationEmail(base)
  const text = renderConfirmationText(base)

  it('keeps the sign-in copy', () => {
    expect(html).toContain('<title>Your sign-in code</title>')
    expect(html).toContain('Your sign-in code for')
    expect(html).toContain('Sign in now &rarr;')
    expect(html).toContain(
      'If you did not request this, you can safely ignore this email.'
    )
    expect(text).toContain('Your sign-in code for philipithomas.com is:')
    expect(text).toContain('Or use this link to sign in directly:')
  })

  it('carries the code and magic link in both parts', () => {
    expect(html).toContain('123456')
    expect(html).toContain(base.magicLink)
    expect(text).toContain('123456')
    expect(text).toContain(base.magicLink)
  })
})

describe('confirm variant', () => {
  const input = {
    ...base,
    purpose: 'confirm' as const,
    newsletters: ['Contraption', 'Workshop', 'Postcard'],
  }
  const html = renderConfirmationEmail(input)
  const text = renderConfirmationText(input)

  it('uses subscription confirmation copy and names the newsletters', () => {
    expect(html).toContain('<title>Confirm your subscription</title>')
    expect(html).toContain(
      'Thanks for subscribing to Contraption, Workshop, and Postcard at'
    )
    expect(html).toContain('Confirm subscription &rarr;')
    expect(html).toContain(
      'If you did not sign up, you can safely ignore this email and you will not receive any newsletters.'
    )
    expect(html).not.toContain('sign-in code')
  })

  it('mirrors the copy in the plaintext part with the raw code and link', () => {
    expect(text).toContain(
      'Thanks for subscribing to Contraption, Workshop, and Postcard at philipithomas.com. Enter this code to confirm your subscription:'
    )
    expect(text).toContain('Or use this link to confirm directly:')
    expect(text).toContain('123456')
    expect(text).toContain(base.magicLink)
  })

  it('falls back to generic copy when no newsletters are named', () => {
    const generic = renderConfirmationText({ ...base, purpose: 'confirm' })
    expect(generic).toContain(
      'Thanks for subscribing to philipithomas.com. Enter this code to confirm your subscription:'
    )
  })

  it('shares the exact dark-mode override block with the sign-in variant', () => {
    const signInHtml = renderConfirmationEmail(base)
    expect(darkBlock(html)).toBe(darkBlock(signInHtml))
  })

  it('snapshots the plaintext confirmation copy', () => {
    // Everything above the footer separator: the © line carries the current
    // year and would rot the snapshot at each new year.
    expect(text.split('\n--\n')[0]).toMatchSnapshot()
  })
})
