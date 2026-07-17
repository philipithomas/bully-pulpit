import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/posts/subscribe-cta', () => ({
  SubscribeCta: () => <div data-testid="subscribe-cta" />,
}))
vi.mock('@/components/auth/sms-subscribe-prompt', () => ({
  SmsSubscribePrompt: ({ homepageLabel }: { homepageLabel?: string }) => (
    <span> or {homepageLabel}</span>
  ),
}))
vi.mock('@/lib/phone/config', () => ({
  sitePhoneDisplayNumber: () => null,
  sitePhoneNumber: () => null,
}))

import UmamiPage from '@/app/umami/page'

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
    expect(html.indexOf('>RSS<')).toBeLessThan(html.indexOf('SMS'))
    expect(html).toContain('SMS (all newsletters)')
  })
})
