import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const phoneMocks = vi.hoisted(() => ({
  displayNumber: vi.fn((): string | null => '+1 212 347 3190'),
  number: vi.fn((): string | null => '+12123473190'),
}))

vi.mock('@/components/posts/subscribe-cta', () => ({
  SubscribeCta: () => <div data-testid="subscribe-cta" />,
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
  })

  it('uses the approved copy and promotes photo MMS above RSS', () => {
    const html = renderToStaticMarkup(<UmamiPage />)

    expect(html).toContain('A photo journal of city life.')
    expect(html).toContain('Just the good stuff.')
    expect(html).not.toContain('Only the good stuff.')
    expect(html).not.toContain('An ongoing photography newsletter.')
    expect(html).toContain('Get umami by text')
    expect(html).toContain(
      'New umami posts arrive by text, with the photo attached when available. The SMS subscription includes my other active newsletters, too.'
    )
    expect(html).toContain('data-analytics-placement="newsletter_page"')
    expect(html).toContain('data-newsletter="umami"')
    expect(html).toContain('data-variant="standalone"')
    expect(html).toContain('Subscribe by SMS')
    expect(html).toContain('Prefer a feed? Follow umami via')
    expect(html).toContain('>RSS</a>')
    expect(html.indexOf('Subscribe by SMS')).toBeLessThan(html.indexOf('>RSS<'))
    expect(metadata).toMatchObject({
      description: SEO_DESCRIPTION,
      openGraph: { description: SEO_DESCRIPTION },
      twitter: { description: SEO_DESCRIPTION },
    })
  })

  it('keeps RSS visible when SMS is not configured', () => {
    phoneMocks.displayNumber.mockReturnValue(null)
    phoneMocks.number.mockReturnValue(null)

    const html = renderToStaticMarkup(<UmamiPage />)

    expect(html).not.toContain('Get umami by text')
    expect(html).not.toContain('Subscribe by SMS')
    expect(html).toContain('Prefer a feed? Follow umami via')
    expect(html).toContain('>RSS</a>')
  })
})
