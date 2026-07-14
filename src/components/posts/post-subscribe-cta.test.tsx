import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useSearchParams } = vi.hoisted(() => ({
  useSearchParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useSearchParams }))
vi.mock('@/components/posts/subscribe-cta', () => ({
  SubscribeCta: () => <div>Email CTA</div>,
}))

import { PostSubscribeCta } from '@/components/posts/post-subscribe-cta'

function renderCta(query = ''): string {
  useSearchParams.mockReturnValue(new URLSearchParams(query))
  return renderToStaticMarkup(<PostSubscribeCta newsletter="contraption" />)
}

describe('PostSubscribeCta', () => {
  beforeEach(() => {
    useSearchParams.mockReset()
  })

  it('hides the email CTA for SMS post links', () => {
    expect(renderCta('utm_source=sms')).not.toContain('Email CTA')
    expect(renderCta('utm_source=sms&utm_campaign=new-post')).not.toContain(
      'Email CTA'
    )
  })

  it('shows the email CTA without the SMS source', () => {
    expect(renderCta()).toContain('Email CTA')
    expect(renderCta('utm_source=email')).toContain('Email CTA')
  })
})
