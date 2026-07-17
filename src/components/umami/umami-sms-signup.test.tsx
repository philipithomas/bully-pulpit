import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  hasSession: null as boolean | null,
  loading: true,
  user: null as null | {
    uuid: string
    email: string
    name: string | null
    isAdmin: boolean
  },
}))

vi.mock('@/components/auth/auth-provider', () => ({
  useAuthContext: () => authMocks,
}))

vi.mock('@/components/auth/sms-subscribe-prompt', () => ({
  SmsSubscribePrompt: ({
    analyticsPlacement,
    newsletter,
    phoneDisplayNumber,
    phoneNumber,
    triggerLabel,
    variant,
  }: {
    analyticsPlacement?: string
    newsletter?: string
    phoneDisplayNumber?: string | null
    phoneNumber?: string | null
    triggerLabel?: string
    variant?: string
  }) => (
    <span
      data-analytics-placement={analyticsPlacement}
      data-newsletter={newsletter}
      data-phone-display-number={phoneDisplayNumber}
      data-phone-number={phoneNumber}
      data-variant={variant}
    >
      {triggerLabel}
    </span>
  ),
}))

import { UmamiSmsSignup } from '@/components/umami/umami-sms-signup'

afterEach(() => {
  authMocks.hasSession = null
  authMocks.loading = true
  authMocks.user = null
})

describe('UmamiSmsSignup', () => {
  it('renders the SMS path for a signed-out visitor', () => {
    authMocks.hasSession = false
    authMocks.loading = false

    const html = renderToStaticMarkup(
      <UmamiSmsSignup
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
      />
    )

    expect(html).toContain('Also available via')
    expect(html).toContain('data-analytics-placement="newsletter_page"')
    expect(html).toContain('data-newsletter="umami"')
    expect(html).toContain('data-phone-number="+12123473190"')
    expect(html).toContain('data-variant="link"')
    expect(html).toContain('>SMS</span>')
  })

  it('hides the complete SMS row for a signed-in visitor', () => {
    authMocks.hasSession = true
    authMocks.loading = false
    authMocks.user = {
      uuid: 'subscriber-1',
      email: 'reader@example.com',
      name: 'Reader',
      isAdmin: false,
    }

    const html = renderToStaticMarkup(
      <UmamiSmsSignup
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
      />
    )

    expect(html).toBe('')
  })

  it('uses the session hint to prevent a logged-in first-paint flash', () => {
    const html = renderToStaticMarkup(
      <UmamiSmsSignup
        phoneDisplayNumber="+1 212 347 3190"
        phoneNumber="+12123473190"
      />
    )

    expect(html).toContain('[[data-member]_&amp;]:hidden')
  })

  it('renders nothing without a configured phone number', () => {
    const html = renderToStaticMarkup(<UmamiSmsSignup />)

    expect(html).toBe('')
  })
})
