import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const phoneMocks = vi.hoisted(() => ({
  displayNumber: vi.fn((): string | null => '+1 212 347 3190'),
  number: vi.fn((): string | null => '+12123473190'),
}))
const subscribeMocks = vi.hoisted(() => ({
  visible: vi.fn(() => true),
}))

vi.mock('@/components/posts/subscribe-cta', () => ({
  SubscribeCta: ({
    className,
    buttonClassName,
    buttonLabel,
  }: {
    className?: string
    buttonClassName?: string
    buttonLabel?: string
  }) =>
    subscribeMocks.visible() ? (
      <div
        className={className}
        data-button-class-name={buttonClassName}
        data-testid="subscribe-cta"
      >
        {buttonLabel}
      </div>
    ) : null,
}))
vi.mock('@/components/auth/sms-subscribe-prompt', () => ({
  SmsSubscribePrompt: ({
    analyticsPlacement,
    newsletter,
    triggerLabel,
    variant,
  }: {
    analyticsPlacement?: string
    newsletter?: string
    triggerLabel?: string
    variant?: string
  }) => (
    <span
      data-analytics-placement={analyticsPlacement}
      data-newsletter={newsletter}
      data-variant={variant}
    >
      {triggerLabel}
    </span>
  ),
}))
vi.mock('@/lib/phone/config', () => ({
  sitePhoneDisplayNumber: phoneMocks.displayNumber,
  sitePhoneNumber: phoneMocks.number,
}))

import UmamiPage, { metadata } from '@/app/umami/page'

const SEO_DESCRIPTION =
  'An ongoing photography newsletter by Philip Thomas about street scenes, city life, coffee, and other things he notices along the way.'

afterEach(() => {
  phoneMocks.displayNumber.mockReturnValue('+1 212 347 3190')
  phoneMocks.number.mockReturnValue('+12123473190')
  subscribeMocks.visible.mockReturnValue(true)
})

describe('UmamiPage viewer contract', () => {
  it('emits immersive parser data for the description-free SFMOMA photo', () => {
    const html = renderToStaticMarkup(<UmamiPage />)

    expect(html).toContain('data-zoom-caption-presentation="immersive"')
    expect(html).toContain('data-zoom-caption-collection="umami"')
    expect(html).toContain('data-zoom-group="umami"')
    expect(html).toContain('data-zoom-caption-href="/sfmoma"')
    expect(html).toContain('href="/sfmoma"')
    expect(html).toContain('data-zoom-caption-title="SFMOMA"')
    expect(html).toContain('data-zoom-caption-date="2026-07-11"')
    expect(html).toContain(
      'data-zoom-caption-location="San Francisco Museum of Modern Art"'
    )
    expect(html).toContain(
      'data-zoom-caption-location-href="https://maps.app.goo.gl/YHxezDBcwdY6quHX9"'
    )
    expect(html).toContain('data-full-sizes="100vw"')
    expect(html).not.toContain('data-zoom-caption-description=')
    expect(html).toContain('href="/sfmoma"')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('<figcaption')
    expect(html).not.toContain('<time')
  })

  it('uses the approved copy and offers SMS as a secondary signup path', () => {
    const html = renderToStaticMarkup(<UmamiPage />)

    expect(html).toContain('Photo journal of city life.')
    expect(html).toContain('Just the good stuff.')
    expect(html).not.toContain('Only the good stuff.')
    expect(html).not.toContain('An ongoing photography newsletter.')
    expect(html).toContain('Also available via')
    expect(html).toContain('data-analytics-placement="newsletter_page"')
    expect(html).toContain('data-newsletter="umami"')
    expect(html).toContain('data-variant="link"')
    expect(html).toContain('>SMS</span>')
    expect(html).toContain(
      'data-button-class-name="btn btn-primary btn-newsletter"'
    )
    expect(html).toContain('>Follow</div>')
    expect(html).not.toContain('Prefer a feed?')
    expect(html).not.toContain('/feed/umami/rss.xml')
    expect(metadata).toMatchObject({
      description: SEO_DESCRIPTION,
      openGraph: { description: SEO_DESCRIPTION },
      twitter: { description: SEO_DESCRIPTION },
    })
  })

  it('omits the secondary signup row when SMS is not configured', () => {
    phoneMocks.displayNumber.mockReturnValue(null)
    phoneMocks.number.mockReturnValue(null)

    const html = renderToStaticMarkup(<UmamiPage />)

    expect(html).not.toContain('Also available via')
    expect(html).not.toContain('>SMS</span>')
    expect(html).not.toContain('/feed/umami/rss.xml')
  })

  it('lets SMS lead without an empty gap when the email CTA is absent', () => {
    subscribeMocks.visible.mockReturnValue(false)

    const html = renderToStaticMarkup(<UmamiPage />)

    expect(html).not.toContain('data-testid="subscribe-cta"')
    expect(html).not.toContain('umami-page-email')
    expect(html).toContain('class="umami-page-sms')
    expect(html).toContain('Also available via')
  })
})
